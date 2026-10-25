import { decodeAiff, isAiff } from '../audio/aiff'
import { MixerGraph } from '../audio/mixerGraph'
import { Transport } from '../audio/transport'
import { type BeatGrid, type DeckId, type TransitionPoints } from '../engine/model'
import { compile, type CompiledPlan } from '../engine/plan/compile'
import { longBlendPlan } from '../engine/plan/longBlend'
import { applyTakes, TakeHistory, type Take } from '../engine/plan/take'
import type { TransitionPlanV1 } from '../engine/plan/types'
import { validate } from '../engine/plan/validate'
import {
  rateB,
  rateToSemitones,
  secondsPerBar,
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

export interface DeckSource {
  name: string
  buffer: AudioBuffer
  grid: BeatGrid
}

export const DEMO_POINTS: TransitionPoints = { exitBarA: 9, entryBarB: 1 }

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

/** The long blend needs 40 bars of A from 8 bars before its exit: the last such phrase line. */
export function defaultExitBar(source: DeckSource): number {
  const bars = Math.floor(
    (source.buffer.duration - source.grid.anchorSec) / secondsPerBar(source.grid),
  )
  return Math.max(9, Math.floor((bars - 40) / 8) * 8 + 1)
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
  /** The plan the strategy made, before any take. */
  basePlan!: TransitionPlanV1
  /** The plan playing: the strategy's plan with the takes, or without them while comparing. */
  plan!: TransitionPlanV1
  readonly history = new TakeHistory()
  /** Which version plays: the user's take or the strategy's original. */
  listening: 'take' | 'original' = 'take'
  compiled!: CompiledPlan
  timing!: TransitionTiming
  /** Errors of the last change that was refused; the previous plan stays loaded. */
  errors: string[] = []
  /** Changes on every accepted or refused change, for React. */
  version = 0
  private readonly listeners = new Set<() => void>()

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

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** A new track on a deck, with a starting grid for the user to correct. */
  setDeck(deck: DeckId, source: DeckSource): void {
    const decks = { ...this.decks, [deck]: source }
    const points = deck === 'A' ? { ...this.points, exitBarA: defaultExitBar(source) } : this.points
    this.change(decks, points)
  }

  setGrid(deck: DeckId, grid: BeatGrid): void {
    this.change({ ...this.decks, [deck]: { ...this.decks[deck], grid } }, this.points)
  }

  setPoints(points: TransitionPoints): void {
    this.change(this.decks, points)
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
    this.loop.setPlan(this.compiled, this.barAt)
    this.notify()
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

  /** Builds and loads the plan; keeps playing from the same transition beat. */
  private change(decks: Record<DeckId, DeckSource>, points: TransitionPoints): void {
    const before = this.transport.state
    const beat =
      before.kind === 'playing'
        ? this.transport.beatAt()
        : before.kind === 'paused'
          ? before.beat
          : undefined
    const previous = { decks: this.decks, points: this.points }
    this.decks = decks
    this.points = points
    if (!this.apply()) {
      this.decks = previous.decks
      this.points = previous.points
    } else {
      this.loop.setPlan(this.compiled, this.barAt)
      const { startBeat, endBeat } = this.compiled.span
      if (beat !== undefined) {
        const at = Math.min(Math.max(beat, startBeat), endBeat - 4)
        if (before.kind === 'playing') this.transport.startAt(at)
        else this.transport.cue(at)
      }
    }
    this.notify()
  }

  /** Validates and loads the plan for the current decks and points. */
  private apply(): boolean {
    const plan = longBlendPlan(
      {
        A: { trackFingerprint: this.decks.A.name, grid: this.decks.A.grid },
        B: { trackFingerprint: this.decks.B.name, grid: this.decks.B.grid },
      },
      this.points,
    )
    const buffers = { A: this.decks.A.buffer, B: this.decks.B.buffer }
    const durationSec = { A: buffers.A.duration, B: buffers.B.duration }
    const { errors } = validate(plan, { durationSec })
    this.errors = errors.map((e) => e.message)
    if (errors.length > 0) return false
    // Takes are in transition beats, so they carry over to a corrected grid or point.
    let playing = this.effectivePlan(plan)
    if (validate(playing, { durationSec }).errors.length > 0) playing = plan
    this.transport.load(playing, buffers)
    this.basePlan = plan
    this.plan = playing
    this.compiled = compile(playing)
    this.timing = timingOf(plan)
    return true
  }
}

export function createSession(options: { logFrames?: number } = {}): PocSession {
  return new PocSession(options)
}
