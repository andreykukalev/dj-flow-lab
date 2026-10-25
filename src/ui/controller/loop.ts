import { HeardClock, readClock, type HeardTime } from '../../audio/clock'
import type { Transport, TransportState } from '../../audio/transport'
import { CONTROL_KEYS, type ControlState } from '../../engine/mixer'
import type { CompiledPlan } from '../../engine/plan/compile'
import { anchorBeatAt } from '../../engine/time'
import type { MixerRenderer, UpcomingMarks } from '../mixer/renderer'
import { upcomingCaption, upcomingChange } from './upcoming'

// The controller loop (D-21, S5): one requestAnimationFrame loop renders
// `stateAt(beat(heardTime))`. Nothing is carried from one frame to the next, so after a
// pause, seek, interruption or hidden tab the next frame is right by construction.

/**
 * Transition beat the listener hears at context time `heard`. While a start is still
 * in the output (seek, resume, replay), the controller already shows the beat being
 * started, rather than running backwards from it.
 */
export function heardBeat(state: TransportState, heard: number, stoppedBeat: number): number {
  switch (state.kind) {
    case 'playing':
      return Math.max(state.anchor.beat, anchorBeatAt(state.anchor, heard))
    case 'paused':
      return state.beat
    case 'stopped':
      return stoppedBeat
  }
}

export interface FrameRecord {
  /** rAF timestamp, ms. */
  frameMs: number
  currentTime: number
  heard: HeardTime
  transport: TransportState
  beat: number
  /** Values the mixer's DOM showed after this frame, read back from it. */
  rendered: ControlState
}

export interface FrameInfo {
  frameMs: number
  heard: HeardTime
  beat: number
  state: ControlState
  transport: TransportState
}

export interface ControllerLoopOptions {
  /** User calibration: how much later than reported the sound is heard, ms. */
  calibrationMs: number
  /** Keep the last N frames for tests and diagnostics (0 = off). */
  logFrames: number
}

export class ControllerLoop {
  private raf = 0
  private readonly clock = new HeardClock()
  private renderer: MixerRenderer | null = null
  private readonly listeners = new Set<(frame: FrameInfo) => void>()
  readonly options: ControllerLoopOptions
  readonly log: FrameRecord[] = []
  readonly transport: Transport
  readonly compiled: CompiledPlan
  /** A-deck bar number at a transition beat, for captions such as "kill at 113". */
  readonly barAt: (beat: number) => number

  constructor(
    transport: Transport,
    compiled: CompiledPlan,
    barAt: (beat: number) => number,
    options: Partial<ControllerLoopOptions> = {},
  ) {
    this.transport = transport
    this.compiled = compiled
    this.barAt = barAt
    this.options = { calibrationMs: 0, logFrames: 0, ...options }
  }

  setCalibration(ms: number): void {
    this.options.calibrationMs = ms
  }

  setRenderer(renderer: MixerRenderer | null): void {
    this.renderer = renderer
  }

  /** Called on every frame with what was drawn: for the playhead, position and flash. */
  onFrame(listener: (frame: FrameInfo) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get running(): boolean {
    return this.raf !== 0
  }

  start(): void {
    if (this.raf) return
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick)
      this.frame(now)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** Renders one frame for rAF time `frameMs`. */
  frame(frameMs: number): FrameInfo {
    const reading = readClock(this.transport.ctx)
    const heard = this.clock.read(reading, frameMs, this.options.calibrationMs)
    const transport = this.transport.state
    const beat = heardBeat(transport, heard.time, this.compiled.span.startBeat)
    const state = this.transport.stateAt(beat)
    const upcoming: UpcomingMarks = {}
    for (const key of CONTROL_KEYS) {
      const change = upcomingChange(this.compiled.controls[key], beat)
      if (change) {
        upcoming[key] = {
          to: change.to,
          caption: upcomingCaption(key, change, this.barAt(change.atBeat)),
        }
      }
    }
    this.renderer?.render(state, upcoming)
    const info: FrameInfo = { frameMs, heard, beat, state, transport }
    if (this.options.logFrames > 0 && this.renderer) {
      this.log.push({
        frameMs,
        currentTime: reading.currentTime,
        heard,
        transport,
        beat,
        rendered: this.renderer.readBack(),
      })
      if (this.log.length > this.options.logFrames) this.log.shift()
    }
    for (const listener of this.listeners) listener(info)
    return info
  }
}
