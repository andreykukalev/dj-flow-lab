import { decodeAiff, isAiff } from '../audio/aiff'
import { english, type Translate } from '../i18n'
import {
  suggestBlendStarts,
  type AutoCandidate,
  type AutoPreferences,
} from '../engine/analysis/autoPoint'
import { MixerGraph } from '../audio/mixerGraph'
import {
  analyseStructure,
  frameFeatures,
  type FrameFeatures,
  type TrackStructure,
} from '../engine/analysis/structure'
import { Transport } from '../audio/transport'
import { type BeatGrid, type DeckId, type TransitionPoints } from '../engine/model'
import {
  DEFAULT_AREA,
  fitArea,
  MIN_AREA_BEATS,
  type AreaRequest,
  type FittedArea,
} from '../engine/plan/area'
import { compile, type CompiledPlan } from '../engine/plan/compile'
import { longBlendPlan } from '../engine/plan/longBlend'
import {
  areaContextFor,
  loopToFill,
  planTiming,
  requestOf,
  resolveLoop,
  type LoopRequest,
} from '../engine/plan/loop'
import { applyTakes, TakeHistory, type Take } from '../engine/plan/take'
import type { TransitionPlanV1 } from '../engine/plan/types'
import { validate, type PlanIssue, type WarningCode } from '../engine/plan/validate'
import {
  barToBeat,
  deckSecToTransitionBeat,
  rateB,
  rateToSemitones,
  secondsPerBar,
  secToBeat,
  toBarBeat,
  transitionBeatToDeckBeat as deckBeatAt,
  type BarBeat,
  type TransitionTiming,
} from '../engine/time'
import { ControllerLoop } from '../ui/controller/loop'
import type { LabState } from '../engine/set/versions'
import { DEMO_TRACKS, renderDemoTrack } from './demoTracks'

// One proof-of-concept session: an AudioContext, the mixer graph, the transport with
// the long-blend plan on two tracks, and the controller loop that shows it. The tracks
// are the generated demo tracks until the user loads files; grids and points can be
// corrected while playing (#46). The user can take over any control while it plays;
// each take is kept in an undoable history and applied on top of the strategy's plan
// (#68), so "Your take" and the original can be compared from the same beat.
//
// The blend start and the transition area around it (#75) are kept here once: the
// cursor, timeline clicks and drags, phrase and section picks and the numeric fields
// all change these, and the plan is generated for the area that fits both tracks.
// Auto (#77) proposes blend starts from both tracks' structure and sets the same two
// values; the user's own choice is kept so the two can be compared.
//
// A loop on one deck (#81) is part of the same arrangement: the user asks for it relative
// to the blend start, like the area, and the plan carries it in that deck's beats. Takes
// stay in transition beats, so they replay with the loop; Auto's ideas and "yours" each
// keep their loop.

export interface DeckSource {
  name: string
  buffer: AudioBuffer
  grid: BeatGrid
}

/** Auto's ideas, and the user's blend start, area and loop from before Auto, to compare with. */
export interface AutoState {
  prefs: AutoPreferences
  /** Best first. */
  candidates: AutoCandidate[]
  /** The idea last put in place. */
  index: number
  /** Whether that idea was put in place straight or with its loop. */
  withLoop: boolean
  yours: { points: TransitionPoints; area: AreaRequest; loop: LoopRequest | null }
}

/** A's bar 25 with B's bar 17, ±16 bars: A bars 9–41 blended with B bars 1–33. */
export const DEMO_POINTS: TransitionPoints = { exitBarA: 25, entryBarB: 17 }

export const timingOf = planTiming

/** A deck's bar.beat at a transition beat. */
export function deckPosition(timing: TransitionTiming, deck: DeckId, beat: number): BarBeat {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  return toBarBeat(grid, deckBeatAt(timing, deck, beat))
}

/** Decodes a local file: natively, or with the AIFF parser where the engine cannot (D-03). */
export async function decodeFile(ctx: BaseAudioContext, file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  try {
    // decodeAudioData detaches the buffer it is given, so pass a copy.
    return await ctx.decodeAudioData(bytes.slice(0))
  } catch (e) {
    if (!isAiff(bytes)) throw e
    const pcm = decodeAiff(bytes)
    const buffer = new AudioBuffer({
      length: pcm.length,
      numberOfChannels: pcm.channels.length,
      sampleRate: pcm.sampleRate,
    })
    pcm.channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i))
    return buffer
  }
}

/** Bars of music from bar 1 to the end of the file. */
export function barsOf(source: DeckSource): number {
  return Math.floor((source.buffer.duration - source.grid.anchorSec) / secondsPerBar(source.grid))
}

/** The last phrase line with the area's bars after it, and room for its bars and a pre-roll before it. */
export function defaultExitBar(source: DeckSource, area: AreaRequest = DEFAULT_AREA): number {
  const last = Math.floor((barsOf(source) - area.afterBars) / 8) * 8 + 1
  return Math.max(Math.ceil(area.beforeBars / 8) * 8 + 9, last)
}

/** One deck's half of the points at a track beat: its bar, and the beat when it is not the first. */
export function pointsAt(
  deck: DeckId,
  grid: BeatGrid,
  trackBeat: number,
): Partial<TransitionPoints> {
  const { bar, beat } = toBarBeat(grid, Math.round(trackBeat))
  return deck === 'A'
    ? { exitBarA: bar, exitBeatA: beat === 1 ? undefined : beat }
    : { entryBarB: bar, entryBeatB: beat === 1 ? undefined : beat }
}

/** The points without beats left at their default, so equal points compare equal. */
function tidy(points: TransitionPoints): TransitionPoints {
  const { exitBeatA, entryBeatB, ...bars } = points
  return {
    ...bars,
    ...(exitBeatA !== undefined && exitBeatA !== 1 && { exitBeatA }),
    ...(entryBeatB !== undefined && entryBeatB !== 1 && { entryBeatB }),
  }
}

function demoSource(deck: DeckId, sampleRate: number): DeckSource {
  const track = DEMO_TRACKS[deck]
  const data = renderDemoTrack(track, sampleRate)
  const buffer = new AudioBuffer({ length: data.length, sampleRate })
  buffer.copyToChannel(data, 0)
  return { name: track.name, buffer, grid: track.grid }
}

export class PocSession {
  readonly ctx: AudioContext
  readonly mixer: MixerGraph
  readonly transport: Transport
  readonly loop: ControllerLoop
  decks: Record<DeckId, DeckSource>
  points: TransitionPoints
  /** The transition area the user asked for, around the blend start. */
  area: AreaRequest = DEFAULT_AREA
  /** The area that fits both tracks: what the plan blends. */
  fitted!: FittedArea
  /** The loop the user asked for (#81), or null for a straight transition. */
  loopRequest: LoopRequest | null = null
  /** The plan the strategy made, before any take. */
  basePlan!: TransitionPlanV1
  /** The plan playing: the strategy's plan with the takes, or without them while comparing. */
  plan!: TransitionPlanV1
  readonly history = new TakeHistory()
  /** Which version plays: the user's take or the strategy's original. */
  listening: 'take' | 'original' = 'take'
  compiled!: CompiledPlan
  /** The version not playing, while there are takes to compare it with; null otherwise. */
  compared: CompiledPlan | null = null
  timing!: TransitionTiming
  /** Auto's ideas since the last Auto click, or null. */
  auto: AutoState | null = null
  /** The words of what the session says (structure reasons, Auto's reasons, errors). */
  t: Translate = english
  /** Advisories on the plan in place, such as a loop on a grid that is not confirmed. */
  warnings: PlanIssue<WarningCode>[] = []
  /** Errors of the last change that was refused; the previous plan stays loaded. */
  errors: string[] = []
  /** Changes on every accepted or refused change, for React. */
  version = 0
  private readonly listeners = new Set<() => void>()
  private readonly features = new WeakMap<AudioBuffer, FrameFeatures>()
  private readonly structures = new Map<DeckId, { source: DeckSource; structure: TrackStructure }>()

  constructor(options: { logFrames?: number } = {}) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.mixer = new MixerGraph(this.ctx)
    this.transport = new Transport(this.ctx, this.mixer)
    this.decks = {
      A: demoSource('A', this.ctx.sampleRate),
      B: demoSource('B', this.ctx.sampleRate),
    }
    this.points = DEMO_POINTS
    this.apply()
    this.loop = new ControllerLoop(this.transport, this.compiled, this.barAt, {
      logFrames: options.logFrames ?? 0,
    })
  }

  /** Deck B's tempo change: percent and semitones. */
  get tempoChange(): { percent: number; semitones: number } {
    const rate = rateB(this.timing)
    return { percent: (rate - 1) * 100, semitones: rateToSemitones(rate) }
  }

  /** The whole track's likely structure on its current grid (#29), computed once per track and grid. */
  structure(deck: DeckId): TrackStructure {
    const source = this.decks[deck]
    const cached = this.structures.get(deck)
    if (cached?.source === source) return cached.structure
    let frames = this.features.get(source.buffer)
    if (!frames) {
      const channels = Array.from({ length: source.buffer.numberOfChannels }, (_, c) =>
        source.buffer.getChannelData(c),
      )
      frames = frameFeatures(channels, source.buffer.sampleRate)
      this.features.set(source.buffer, frames)
    }
    const structure = analyseStructure(frames, source.grid, this.t)
    this.structures.set(deck, { source, structure })
    return structure
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** A new track on a deck, with a starting grid for the user to correct. */
  setDeck(deck: DeckId, source: DeckSource): void {
    this.auto = null
    const decks = { ...this.decks, [deck]: source }
    const points =
      deck === 'A'
        ? tidy({ ...this.points, exitBarA: defaultExitBar(source, this.area), exitBeatA: 1 })
        : this.points
    const loop = this.loopRequest?.deck === deck ? null : this.loopRequest
    this.change(decks, points, this.area, false, loop)
  }

  setGrid(deck: DeckId, grid: BeatGrid): void {
    this.auto = null
    this.change({ ...this.decks, [deck]: { ...this.decks[deck], grid } }, this.points)
  }

  /** New points; the cursor keeps its place in track A. */
  setPoints(points: TransitionPoints): void {
    this.change(this.decks, tidy(points), this.area, true)
  }

  /** Track beat of A at the blend start. */
  get blendStartBeat(): number {
    return this.markBeat('A')
  }

  /** Track beat of a deck at the blend start: A's blend start, or the beat of B lined up with it. */
  markBeat(deck: DeckId): number {
    return deckBeatAt(this.timing, deck, 0)
  }

  /** Moves a deck's side of the blend start to one of its track beats, on the nearest beat. */
  setMark(deck: DeckId, trackBeat: number): void {
    this.setPoints({ ...this.points, ...pointsAt(deck, this.decks[deck].grid, trackBeat) })
  }

  /** Moves the blend start to a track beat of A, on the nearest beat. */
  setBlendStart(trackBeatA: number): void {
    this.setMark('A', trackBeatA)
  }

  /** Moves the blend start to where the cursor is. */
  setBlendStartAtCursor(): void {
    this.setBlendStart(deckBeatAt(this.timing, 'A', this.transport.beatAt()))
  }

  setArea(area: AreaRequest): void {
    this.change(this.decks, this.points, area)
  }

  /** A loop on one deck, or null for none (#81). The blend start and area stay where they are. */
  setLoop(loop: LoopRequest | null): void {
    this.change(this.decks, this.points, this.area, false, loop)
  }

  /**
   * A loop that gives back bars the area had to trim because one track has no music
   * there, for the current blend start and area; null when there is none to offer.
   */
  get loopToFill(): LoopRequest | null {
    if (this.fitted.trimmed.length === 0) return null
    const straight: TransitionTiming = { ...this.timing }
    delete straight.loop
    return loopToFill(this.area, straight, { A: this.beatsOf('A'), B: this.beatsOf('B') })
  }

  /** Track beats of music from bar 1 to the end of a deck's file. */
  beatsOf(deck: DeckId): number {
    const source = this.decks[deck]
    return secToBeat(source.grid, source.buffer.duration)
  }

  /**
   * A likely section of one deck as the area: that deck's side of the blend start on
   * the section's middle bar, and the area across the section.
   */
  useSection(deck: DeckId, fromBar: number, toBar: number): void {
    const bars = toBar - fromBar + 1
    const before = Math.floor(bars / 2)
    const area = { beforeBars: before, afterBars: bars - before, linked: before === bars - before }
    const grid = this.decks[deck].grid
    const points = { ...this.points, ...pointsAt(deck, grid, barToBeat(grid, fromBar + before)) }
    this.change(this.decks, tidy(points), area, true)
  }

  /**
   * Auto: ranks blend starts on both tracks' phrase lines and puts the best one in
   * place, cued at its pre-roll. The user's current choice is kept to go back to.
   */
  suggestBlend(prefs: AutoPreferences = {}): void {
    const track = (deck: DeckId) => {
      const source = this.decks[deck]
      return {
        structure: this.structure(deck),
        grid: source.grid,
        beats: secToBeat(source.grid, source.buffer.duration),
      }
    }
    const candidates = suggestBlendStarts(track('A'), track('B'), this.area, prefs, 3, this.t)
    if (candidates.length === 0) {
      this.errors = [this.t('auto.noPlace')]
      this.notify()
      return
    }
    const yours =
      this.auto && this.autoShowing
        ? this.auto.yours
        : { points: this.points, area: this.area, loop: this.loopRequest }
    this.auto = { prefs, candidates, index: 0, withLoop: false, yours }
    this.showIdea(0)
  }

  /**
   * Another language for what the session says: the structures are described again and
   * Auto's ideas, which are deterministic, are computed again in the new words.
   */
  setTranslate(t: Translate): void {
    if (t === this.t) return
    this.t = t
    this.structures.clear()
    const auto = this.auto
    if (auto) {
      const track = (deck: DeckId) => {
        const source = this.decks[deck]
        return {
          structure: this.structure(deck),
          grid: source.grid,
          beats: secToBeat(source.grid, source.buffer.duration),
        }
      }
      const candidates = suggestBlendStarts(
        track('A'),
        track('B'),
        auto.yours.area,
        auto.prefs,
        3,
        t,
      )
      if (candidates.length === auto.candidates.length) auto.candidates = candidates
    }
    this.notify()
  }

  /**
   * Puts one of Auto's ideas in place, cued at its pre-roll: straight, or with its
   * loop-assisted alternative when it has one and `withLoop` asks for it.
   */
  showIdea(index: number, withLoop = false): void {
    const auto = this.auto
    const c = auto?.candidates[index]
    if (!auto || !c) return
    auto.index = index
    auto.withLoop = withLoop && c.alternative !== undefined
    const loop = auto.withLoop ? c.alternative!.loop : null
    this.change(this.decks, { exitBarA: c.exitBarA, entryBarB: c.entryBarB }, c.area, false, loop)
    this.cueStart()
  }

  /** The user's blend start, area and loop from before Auto, cued at the pre-roll. */
  backToYours(): void {
    if (!this.auto) return
    const { points, area, loop } = this.auto.yours
    this.change(this.decks, points, area, false, loop)
    this.cueStart()
  }

  /** Whether the blend start, area and loop are Auto's idea, unchanged. */
  get autoShowing(): boolean {
    const auto = this.auto
    const c = auto?.candidates[auto.index]
    if (!auto || !c) return false
    const p = this.points
    const loop = auto.withLoop ? (c.alternative?.loop ?? null) : null
    return (
      p.exitBarA === c.exitBarA &&
      (p.exitBeatA ?? 1) === 1 &&
      p.entryBarB === c.entryBarB &&
      (p.entryBeatB ?? 1) === 1 &&
      this.area.beforeBars === c.area.beforeBars &&
      this.area.afterBars === c.area.afterBars &&
      this.area.linked === c.area.linked &&
      sameLoop(this.loopRequest, loop)
    )
  }

  /** Where replay starts: the pre-roll; playing goes on from there. */
  private cueStart(): void {
    if (this.errors.length > 0) return
    const at = this.compiled.span.startBeat
    if (this.transport.state.kind === 'playing') this.transport.startAt(at)
    else this.transport.cue(at)
  }

  /** The fitted area in transition beats. */
  get areaBeats(): { from: number; to: number } {
    return { from: 0 - this.fitted.beforeBeats, to: this.fitted.afterBeats }
  }

  /** Where the cursor can go: all of track A, and the plan. */
  get seekRange(): { from: number; to: number } {
    const a = this.decks.A
    const toTransition = (sec: number) => deckSecToTransitionBeat(this.timing, 'A', sec)
    const { startBeat, endBeat } = this.compiled.span
    return {
      from: Math.min(startBeat, Math.ceil(toTransition(0))),
      to: Math.max(endBeat, Math.floor(toTransition(a.buffer.duration))) - 4,
    }
  }

  /**
   * A control the user took over while playing; listening switches to the take. With
   * null (let go without moving), the control just follows the plan again.
   */
  addTake(take: Take | null): void {
    if (take) {
      this.history.add(take)
      this.listening = 'take'
    }
    this.refreshTakes()
  }

  undo(): void {
    this.history.undo()
    this.refreshTakes()
  }

  redo(): void {
    this.history.redo()
    this.refreshTakes()
  }

  /** What plays now, to save as a version of the transition (#93). */
  snapshot(): LabState {
    return {
      points: { ...this.points },
      area: { ...this.area },
      loop: this.loopRequest ? { ...this.loopRequest } : null,
      takes: [...this.history.takes],
      grids: { A: this.decks.A.grid, B: this.decks.B.grid },
    }
  }

  /**
   * Puts a saved version in place on the same two tracks. Playing goes on at the same
   * transition beat, so two versions can be compared bar for bar (#94); the takes it
   * replaces come back with undo.
   */
  restore(state: LabState): void {
    this.auto = null
    this.history.load(state.takes)
    this.listening = 'take'
    const decks = {
      A: { ...this.decks.A, grid: state.grids.A },
      B: { ...this.decks.B, grid: state.grids.B },
    }
    this.change(decks, { ...state.points }, { ...state.area }, false, state.loop)
  }

  /** Back to the strategy's plan. Undo brings the takes back. */
  reset(): void {
    this.history.reset()
    this.refreshTakes()
  }

  listenTo(version: 'take' | 'original'): void {
    this.listening = version
    this.refreshTakes()
  }

  /** The plan to play for the current takes and listening choice. */
  private effectivePlan(base: TransitionPlanV1): TransitionPlanV1 {
    return this.listening === 'take' ? applyTakes(base, this.history.takes) : base
  }

  /** Loads the plan with the current takes without interrupting playback. */
  private refreshTakes(): void {
    const plan = this.effectivePlan(this.basePlan)
    try {
      this.transport.replacePlan(plan)
      this.plan = plan
      this.compiled = compile(plan)
      this.errors = []
    } catch (e) {
      this.errors = [e instanceof Error ? e.message : String(e)]
    }
    this.compared = this.compileCompared()
    this.loop.setPlan(this.compiled, this.barAt)
    this.notify()
  }

  /** The version that is not playing: the original under the take, or the take under the original. */
  private compileCompared(): CompiledPlan | null {
    if (this.history.takes.length === 0) return null
    try {
      return compile(
        this.listening === 'take' ? this.basePlan : applyTakes(this.basePlan, this.history.takes),
      )
    } catch {
      return null
    }
  }

  private notify(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }

  async close(): Promise<void> {
    this.loop.stop()
    this.transport.stop()
    await this.ctx.close()
  }

  private barAt = (beat: number): number => deckPosition(this.timing, 'A', beat).bar

  /**
   * Builds and loads the plan; keeps playing from the same transition beat, or with
   * `keepTrackPosition`, from the same place in track A when the blend start moves.
   */
  private change(
    decks: Record<DeckId, DeckSource>,
    points: TransitionPoints,
    area: AreaRequest = this.area,
    keepTrackPosition = false,
    loop: LoopRequest | null = this.loopRequest,
  ): void {
    const before = this.transport.state
    const startBefore = this.blendStartBeat
    let beat =
      before.kind === 'playing'
        ? this.transport.beatAt()
        : before.kind === 'paused'
          ? before.beat
          : undefined
    const previous = {
      decks: this.decks,
      points: this.points,
      area: this.area,
      loop: this.loopRequest,
    }
    this.decks = decks
    this.points = points
    this.area = area
    this.loopRequest = loop
    if (!this.apply()) {
      this.decks = previous.decks
      this.points = previous.points
      this.area = previous.area
      this.loopRequest = previous.loop
    } else {
      this.loop.setPlan(this.compiled, this.barAt)
      if (beat !== undefined) {
        if (keepTrackPosition) beat += startBefore - this.blendStartBeat
        const { from, to } = this.seekRange
        const at = Math.min(Math.max(beat, from), to)
        if (before.kind === 'playing') this.transport.startAt(at)
        else this.transport.cue(at)
      }
    }
    this.notify()
  }

  /** Validates and loads the plan for the current decks, points and area. */
  private apply(): boolean {
    const { A, B } = this.decks
    const timing: TransitionTiming = { gridA: A.grid, gridB: B.grid, ...this.points }
    const beats = { A: this.beatsOf('A'), B: this.beatsOf('B') }
    if (this.loopRequest) {
      const deck = this.loopRequest.deck
      const resolved = resolveLoop(
        this.loopRequest,
        {
          grid: this.decks[deck].grid,
          entryBeat: deckBeatAt(timing, deck, 0),
          beats: beats[deck],
        },
        this.t,
      )
      if ('error' in resolved) {
        this.errors = [resolved.error]
        return false
      }
      timing.loop = resolved.loop
      // Shown as it plays: a gap the deck has no music for is shortened.
      this.loopRequest = requestOf(resolved.loop, timing)
    }
    const fitted = fitArea(this.area, areaContextFor(timing, beats), this.t)
    // A blend too short to play is still built, so the validator can say why.
    const area = fitted.tooShort
      ? { ...fitted, beforeBeats: 0, afterBeats: MIN_AREA_BEATS }
      : fitted
    const plan: TransitionPlanV1 = {
      ...longBlendPlan(
        {
          A: { trackFingerprint: A.name, grid: A.grid },
          B: { trackFingerprint: B.name, grid: B.grid },
        },
        this.points,
        area,
      ),
      ...(timing.loop && { loop: timing.loop }),
    }
    const buffers = { A: A.buffer, B: B.buffer }
    const durationSec = { A: buffers.A.duration, B: buffers.B.duration }
    const { errors, warnings } = validate(plan, { durationSec })
    this.errors = errors.map((e) => e.message)
    if (errors.length === 0 && fitted.tooShort) {
      this.errors = [this.t('auto.tooShort')]
    }
    if (this.errors.length > 0) return false
    // Takes are in transition beats, so they carry over to a corrected grid or point.
    let playing = this.effectivePlan(plan)
    if (validate(playing, { durationSec }).errors.length > 0) playing = plan
    this.transport.load(playing, buffers)
    this.basePlan = plan
    this.plan = playing
    this.compiled = compile(playing)
    this.compared = this.compileCompared()
    this.timing = timingOf(plan)
    this.fitted = fitted
    this.warnings = warnings
    return true
  }
}

function sameLoop(a: LoopRequest | null, b: LoopRequest | null): boolean {
  if (!a || !b) return a === b
  return (
    a.deck === b.deck &&
    a.side === b.side &&
    a.bars === b.bars &&
    a.passes === b.passes &&
    a.gapBars === b.gapBars
  )
}

export function createSession(options: { logFrames?: number } = {}): PocSession {
  return new PocSession(options)
}
