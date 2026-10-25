import { MixerGraph } from '../audio/mixerGraph'
import { Transport } from '../audio/transport'
import { DECK_IDS, type DeckId } from '../engine/model'
import { compile, type CompiledPlan } from '../engine/plan/compile'
import { longBlendPlan } from '../engine/plan/longBlend'
import type { TransitionPlanV1 } from '../engine/plan/types'
import {
  rateB,
  rateToSemitones,
  toBarBeat,
  transitionBeatToDeckBeat,
  type BarBeat,
  type TransitionTiming,
} from '../engine/time'
import { ControllerLoop } from '../ui/controller/loop'
import { DEMO_TRACKS, renderDemoTrack } from './demoTracks'

// One proof-of-concept session: an AudioContext, the mixer graph, the transport with
// the long-blend plan on the demo tracks, and the controller loop that shows it.

export const POINTS = { exitBarA: 9, entryBarB: 1 }

export function demoPlan(): TransitionPlanV1 {
  return longBlendPlan(
    {
      A: { trackFingerprint: 'demo-a', grid: DEMO_TRACKS.A.grid },
      B: { trackFingerprint: 'demo-b', grid: DEMO_TRACKS.B.grid },
    },
    POINTS,
  )
}

export function timingOf(plan: TransitionPlanV1): TransitionTiming {
  return { gridA: plan.decks.A.grid, gridB: plan.decks.B.grid, ...plan.points }
}

/** A deck's bar.beat at a transition beat. */
export function deckPosition(timing: TransitionTiming, deck: DeckId, beat: number): BarBeat {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  return toBarBeat(grid, transitionBeatToDeckBeat(timing, deck, beat))
}

export interface PocSession {
  ctx: AudioContext
  mixer: MixerGraph
  transport: Transport
  loop: ControllerLoop
  plan: TransitionPlanV1
  compiled: CompiledPlan
  timing: TransitionTiming
  /** Deck B's tempo change: percent and semitones. */
  tempoChange: { percent: number; semitones: number }
  close(): Promise<void>
}

export function createSession(options: { logFrames?: number } = {}): PocSession {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  const mixer = new MixerGraph(ctx)
  const transport = new Transport(ctx, mixer)
  const plan = demoPlan()
  const buffers = {} as Record<DeckId, AudioBuffer>
  for (const deck of DECK_IDS) {
    const data = renderDemoTrack(DEMO_TRACKS[deck], ctx.sampleRate)
    const buffer = new AudioBuffer({ length: data.length, sampleRate: ctx.sampleRate })
    buffer.copyToChannel(data, 0)
    buffers[deck] = buffer
  }
  transport.load(plan, buffers)
  const compiled = compile(plan)
  const timing = timingOf(plan)
  const loop = new ControllerLoop(
    transport,
    compiled,
    (beat) => deckPosition(timing, 'A', beat).bar,
    { logFrames: options.logFrames ?? 0 },
  )
  const rate = rateB(timing)
  return {
    ctx,
    mixer,
    transport,
    loop,
    plan,
    compiled,
    timing,
    tempoChange: { percent: (rate - 1) * 100, semitones: rateToSemitones(rate) },
    async close() {
      loop.stop()
      transport.stop()
      await ctx.close()
    },
  }
}
