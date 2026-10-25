import { decodeAiff, isAiff } from '../audio/aiff'
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
import { applyTakes, TakeHistory, type Take } from '../engine/plan/take'
import type { TransitionPlanV1 } from '../engine/plan/types'
import { validate } from '../engine/plan/validate'
import {
  barToBeat,
  rateB,
  rateToSemitones,
  secondsPerBar,
  secToBeat,
  toBarBeat,
  transitionBeatToDeckBeat,
  type BarBeat,
  type TransitionTiming,
} from '../engine/time'
import { ControllerLoop } from '../ui/controller/loop'
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

export interface DeckSource {
  name: string
  buffer: AudioBuffer
  grid: BeatGrid
}

/** A's bar 25 with B's bar 17, ±16 bars: A bars 9–41 blended with B bars 1–33. */
export const DEMO_POINTS: TransitionPoints = { exitBarA: 25, entryBarB: 17 }

export function timingOf(plan: TransitionPlanV1): TransitionTiming {
  return { gridA: plan.decks.A.grid, gridB: plan.decks.B.grid, ...plan.points }
}

/** A deck's bar.beat at a transition beat. */
export function deckPosition(timing: TransitionTiming, deck: DeckId, beat: number): BarBeat {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  return toBarBeat(grid, transitionBeatToDeckBeat(timing, deck, beat))
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

/** A track beat as `bar.beat` points: the bar, and the beat when it is not the first. */
export function pointsAt(
  grid: BeatGrid,
  trackBeat: number,
): Pick<TransitionPoints, 'exitBarA' | 'exitBeatA'> {
  const { bar, beat } = toBarBeat(grid, Math.round(trackBeat))
  return beat === 1 ? { exitBarA: bar } : { exitBarA: bar, exitBeatA: beat }
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
    const structure = analyseStructure(frames, source.grid)
    this.structures.set(deck, { source, structure })
    return structure
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** A new track on a deck, with a starting grid for the user to correct. */
  setDeck(deck: DeckId, source: DeckSource): void {
    const decks = { ...this.decks, [deck]: source }
    const points =
      deck === 'A'
        ? { exitBarA: defaultExitBar(source, this.area), entryBarB: this.points.entryBarB }
        : this.points
    this.change(decks, points)
  }

  setGrid(deck: DeckId, grid: BeatGrid): void {
    this.change({ ...this.decks, [deck]: { ...this.decks[deck], grid } }, this.points)
  }

  /** New points; the cursor keeps its place in track A. */
  setPoints(points: TransitionPoints): void {
    this.change(this.decks, points, this.area, true)
  }

  /** Track beat of A at the blend start. */
  get blendStartBeat(): number {
    return transitionBeatToDeckBeat(this.timing, 'A', 0)
  }

  /** Moves the blend start to a track beat of A, on the nearest beat. */
  setBlendStart(trackBeatA: number): void {
    const { entryBarB } = this.points
    this.setPoints({ ...pointsAt(this.decks.A.grid, trackBeatA), entryBarB })
  }

  /** Moves the blend start to where the cursor is. */
  setBlendStartAtCursor(): void {
    this.setBlendStart(transitionBeatToDeckBeat(this.timing, 'A', this.transport.beatAt()))
  }

  setArea(area: AreaRequest): void {
    this.change(this.decks, this.points, area)
  }

  /** A likely section of A as the area: the blend start on its middle bar, the area across it. */
  useSection(fromBar: number, toBar: number): void {
    const bars = toBar - fromBar + 1
    const before = Math.floor(bars / 2)
    const area = { beforeBars: before, afterBars: bars - before, linked: before === bars - before }
    this.change(
      this.decks,
      { exitBarA: fromBar + before, entryBarB: this.points.entryBarB },
      area,
      true,
    )
  }

  /** The fitted area in transition beats. */
  get areaBeats(): { from: number; to: number } {
    return { from: 0 - this.fitted.beforeBeats, to: this.fitted.afterBeats }
  }

  /** Where the cursor can go: all of track A, and the plan. */
  get seekRange(): { from: number; to: number } {
    const a = this.decks.A
    const toTransition = (sec: number) =>
      secToBeat(a.grid, sec) - transitionBeatToDeckBeat(this.timing, 'A', 0)
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
  ): void {
    const before = this.transport.state
    const startBefore = this.blendStartBeat
    let beat =
      before.kind === 'playing'
        ? this.transport.beatAt()
        : before.kind === 'paused'
          ? before.beat
          : undefined
    const previous = { decks: this.decks, points: this.points, area: this.area }
    this.decks = decks
    this.points = points
    this.area = area
    if (!this.apply()) {
      this.decks = previous.decks
      this.points = previous.points
      this.area = previous.area
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
    const beatsOf = (s: DeckSource) => secToBeat(s.grid, s.buffer.duration)
    const fitted = fitArea(this.area, {
      startBeatA: transitionBeatToDeckBeat(timing, 'A', 0),
      entryBeatB: barToBeat(B.grid, this.points.entryBarB),
      beatsA: beatsOf(A),
      beatsB: beatsOf(B),
    })
    // A blend too short to play is still built, so the validator can say why.
    const area = fitted.tooShort
      ? { ...fitted, beforeBeats: 0, afterBeats: MIN_AREA_BEATS }
      : fitted
    const plan = longBlendPlan(
      {
        A: { trackFingerprint: A.name, grid: A.grid },
        B: { trackFingerprint: B.name, grid: B.grid },
      },
      this.points,
      area,
    )
    const buffers = { A: A.buffer, B: B.buffer }
    const durationSec = { A: buffers.A.duration, B: buffers.B.duration }
    const { errors } = validate(plan, { durationSec })
    this.errors = errors.map((e) => e.message)
    if (errors.length === 0 && fitted.tooShort) {
      this.errors = ['There is less than a bar of music in both tracks around this blend start']
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
    return true
  }
}

export function createSession(options: { logFrames?: number } = {}): PocSession {
  return new PocSession(options)
}
