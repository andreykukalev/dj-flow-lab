import { compile, stateAt, valueAt, type CompiledPlan } from '../engine/plan/compile'
import type { TransitionPlanV1 } from '../engine/plan/types'
import { validate } from '../engine/plan/validate'
import { CONTROL_KEYS, type ControlState } from '../engine/mixer'
import { DECK_IDS, type DeckId } from '../engine/model'
import {
  anchorBeatAt,
  rateB,
  transitionBeatToDeckSec,
  type PlaybackAnchor,
  type TransitionTiming,
} from '../engine/time'
import type { MixerGraph } from './mixerGraph'
import { DEFAULT_SCHEDULE, schedulePlan, type ScheduleOptions } from './scheduler'

// The transport (D-04, D-05, D-06). Every way of starting playback — play, resume,
// seek, replay — is `startAt(beat)`. The anchor is the only record of position.

export interface TransportOptions extends ScheduleOptions {
  /** Time between a start request and the first sound, in seconds (provisional). */
  leadSec: number
  /** Transport gate fade for starts, stops and seeks, in seconds (D-15). */
  fadeSec: number
}

export const DEFAULT_TRANSPORT: TransportOptions = {
  ...DEFAULT_SCHEDULE,
  leadSec: 0.03,
  fadeSec: 0.01,
}

export type TransportState =
  | { kind: 'stopped' }
  | { kind: 'playing'; anchor: PlaybackAnchor }
  | { kind: 'paused'; beat: number }

/** A gate ramp: the gate moves linearly from `v0` at `t0` to `v1` at `t1`, then holds. */
interface GateRamp {
  t0: number
  v0: number
  t1: number
  v1: number
}

/**
 * Every action takes the context time it happens at, `at`, which defaults to now.
 * Tests pass later times to script a whole session on an OfflineAudioContext before
 * rendering (Firefox has no `OfflineAudioContext.suspend`); the app never does.
 */
export class Transport {
  private compiled: CompiledPlan | undefined
  private timing: TransitionTiming | undefined
  private buffers: Record<DeckId, AudioBuffer> | undefined
  private sources: AudioBufferSourceNode[] = []
  private current: TransportState = { kind: 'stopped' }
  /** Recent gate ramps, oldest first. */
  private gates: GateRamp[] = []
  private readonly listeners = new Set<(state: TransportState) => void>()
  readonly options: TransportOptions
  readonly ctx: BaseAudioContext
  readonly mixer: MixerGraph

  constructor(ctx: BaseAudioContext, mixer: MixerGraph, options: Partial<TransportOptions> = {}) {
    this.ctx = ctx
    this.mixer = mixer
    this.options = { ...DEFAULT_TRANSPORT, ...options }
    if (ctx instanceof AudioContext) {
      // An interrupted or suspended context pauses the transport where it was (D-06).
      ctx.addEventListener('statechange', () => {
        if (ctx.state !== 'running' && this.current.kind === 'playing') this.pause()
      })
    }
  }

  get state(): TransportState {
    return this.current
  }

  /** Loads a plan and the decoded audio of both decks. Refuses plans with errors (D-19). */
  load(plan: TransitionPlanV1, buffers: Record<DeckId, AudioBuffer>): void {
    const durationSec = { A: buffers.A.duration, B: buffers.B.duration }
    const { errors } = validate(plan, { durationSec })
    if (errors.length > 0) {
      throw new Error(`Plan has errors: ${errors.map((e) => e.message).join('; ')}`)
    }
    this.stop()
    this.compiled = compile(plan)
    this.timing = { gridA: plan.decks.A.grid, gridB: plan.decks.B.grid, ...plan.points }
    this.buffers = buffers
    this.mixer.applyState(stateAt(this.compiled, plan.span.startBeat))
  }

  /** Transition beat being rendered at context time `t` (defaults to now). */
  beatAt(t: number = this.ctx.currentTime): number {
    switch (this.current.kind) {
      case 'playing':
        return anchorBeatAt(this.current.anchor, t)
      case 'paused':
        return this.current.beat
      case 'stopped':
        return this.compiled?.span.startBeat ?? 0
    }
  }

  /** Control state at a transition beat: what the controller shows. */
  stateAt(beat: number): ControlState {
    if (!this.compiled) throw new Error('No plan loaded')
    return stateAt(this.compiled, beat)
  }

  /** Starts playback at a transition beat. Play, resume, seek and replay all come here. */
  startAt(beat: number, at: number = this.ctx.currentTime): PlaybackAnchor {
    const { compiled, timing, buffers } = this.loaded()
    const { leadSec, fadeSec } = this.options
    // The gates must be closed before the new start, or cancelling would cut the fade.
    const ctxTime = at + Math.max(leadSec, fadeSec + 0.001)
    this.silence(at)

    const anchor: PlaybackAnchor = { ctxTime, beat, bpm: timing.gridA.bpm }
    for (const deck of DECK_IDS) {
      const rate = deck === 'A' ? 1 : rateB(timing)
      const buffer = buffers[deck]
      const offset = transitionBeatToDeckSec(timing, deck, beat)
      if (offset >= buffer.duration) continue
      const source = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate })
      source.connect(this.mixer.decks[deck].input)
      // A deck whose audio starts later than this beat waits for it.
      if (offset >= 0) source.start(ctxTime, offset)
      else source.start(ctxTime - offset / rate, 0)
      this.sources.push(source)
    }

    // Parameters jump to the state at `beat` while the gates are closed, then follow the plan.
    schedulePlan(compiled, this.mixer, anchor, this.options)
    this.rampGate(ctxTime, 0, ctxTime + fadeSec, 1)
    this.set({ kind: 'playing', anchor })
    return anchor
  }

  /** Pauses at the beat being rendered at `at`. */
  pause(at: number = this.ctx.currentTime): void {
    if (this.current.kind !== 'playing') return
    const beat = anchorBeatAt(this.current.anchor, at)
    this.silence(at)
    this.set({ kind: 'paused', beat })
  }

  /** Resumes from the paused beat. */
  resume(at: number = this.ctx.currentTime): PlaybackAnchor | undefined {
    if (this.current.kind !== 'paused') return undefined
    return this.startAt(this.current.beat, at)
  }

  stop(at: number = this.ctx.currentTime): void {
    this.silence(at)
    this.set({ kind: 'stopped' })
  }

  subscribe(listener: (state: TransportState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Fades the gates out from `at`, stops the sources at the end of the fade, and
   * freezes every plan parameter at its value at `at`, so nothing moves during the fade.
   */
  private silence(at: number): void {
    const { fadeSec } = this.options
    this.rampGate(at, this.gateAt(at), at + fadeSec, 0)
    for (const source of this.sources) {
      source.stop(at + fadeSec)
      source.onended = () => source.disconnect()
    }
    this.sources = []
    if (!this.compiled) return
    // Always set the value again after cancelling: Firefox records a `.value` assignment
    // as an event at that time, so cancelling at the same time drops it and the
    // parameter falls back to its default (found in S3: filters at 350 Hz for a block).
    const beat = this.beatAt(at)
    for (const key of CONTROL_KEYS) {
      for (const { param, map } of this.mixer.targetsOf(key)) {
        param.cancelScheduledValues(at)
        param.setValueAtTime(map(valueAt(this.compiled.controls[key], beat)), at)
      }
    }
  }

  /** The gate's value at time `t`, from the ramps scheduled (never read from the param). */
  private gateAt(t: number): number {
    const g = this.gates.findLast((r) => r.t0 <= t)
    if (!g) return 0
    if (t >= g.t1) return g.v1
    return g.v0 + ((g.v1 - g.v0) * (t - g.t0)) / (g.t1 - g.t0)
  }

  private rampGate(t0: number, v0: number, t1: number, v1: number): void {
    for (const deck of DECK_IDS) {
      const gain = this.mixer.decks[deck].gate.gain
      gain.cancelScheduledValues(t0)
      gain.setValueAtTime(v0, t0)
      gain.linearRampToValueAtTime(v1, t1)
    }
    this.gates = [...this.gates.filter((g) => g.t0 < t0).slice(-3), { t0, v0, t1, v1 }]
  }

  private loaded() {
    if (!this.compiled || !this.timing || !this.buffers) throw new Error('No plan loaded')
    return { compiled: this.compiled, timing: this.timing, buffers: this.buffers }
  }

  private set(state: TransportState): void {
    this.current = state
    for (const listener of this.listeners) listener(state)
  }
}
