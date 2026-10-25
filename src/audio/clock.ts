// Heard time (D-21): the context time of the sample the listener hears now. The
// controller renders `stateAt(beat(heardTime))`, so the mixer shows what is heard,
// not what is being rendered, which is ahead of it by the output latency.

/**
 * Where the latency estimate came from, best first. `outputTimestamp+latency`: the
 * timestamp moves smoothly but carried forward gives the rendering clock, not the
 * output (Firefox, S5), so the reported latency is subtracted from it.
 */
export type LatencySource =
  'outputTimestamp' | 'outputTimestamp+latency' | 'outputLatency' | 'baseLatency' | 'none'

/** One reading of an audio context's clocks, taken in a single frame. */
export interface ClockReading {
  currentTime: number
  /** `performance.now()` when the reading was taken, ms. */
  performanceNow?: number
  /** From `getOutputTimestamp()`, when the engine has it and it has started. */
  outputTimestamp?: { contextTime: number; performanceTime: number }
  outputLatency?: number
  baseLatency?: number
}

export interface HeardTime {
  /** Context time being heard, after the calibration offset. */
  time: number
  source: LatencySource
  /** `currentTime − time`, in seconds: how far the heard sound is behind rendering. */
  latencySec: number
}

export function readClock(ctx: BaseAudioContext): ClockReading {
  const reading: ClockReading = { currentTime: ctx.currentTime, performanceNow: performance.now() }
  if (!(ctx instanceof AudioContext)) return reading
  const ts = ctx.getOutputTimestamp?.()
  // Before the output has started, engines report zeros (Chromium) or omit the fields.
  if (ts?.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
    reading.outputTimestamp = { contextTime: ts.contextTime, performanceTime: ts.performanceTime }
  }
  if (Number.isFinite(ctx.outputLatency)) reading.outputLatency = ctx.outputLatency
  if (Number.isFinite(ctx.baseLatency)) reading.baseLatency = ctx.baseLatency
  return reading
}

/**
 * Context time being heard at `perfNowMs` (a `performance.now()` or rAF timestamp).
 *
 * Source order (D-21, S5):
 * 1. `getOutputTimestamp()`: the context time at the output device at a known
 *    performance time, carried forward to `perfNowMs`. It moves smoothly, where
 *    `currentTime` moves in steps of one audio callback (Chromium).
 *    Chromium's timestamp includes the output latency. Firefox's performance time is
 *    behind `performance.now()` by the output latency, so carried forward it lands on
 *    `currentTime`. When the timestamp, carried forward to the moment of reading, lags
 *    `currentTime` by less than half the reported latency, the reported latency is
 *    subtracted from it.
 * 2. `currentTime − (outputLatency + baseLatency)`.
 * 3. `currentTime − baseLatency`.
 *
 * A positive `offsetMs` (the user's calibration, for example Bluetooth) means the sound
 * is heard later than the engine reports. Heard time is never ahead of `currentTime`.
 */
export function heardTime(reading: ClockReading, perfNowMs: number, offsetMs = 0): HeardTime {
  const { currentTime, outputTimestamp: ts, outputLatency, baseLatency } = reading
  const reported = (outputLatency ?? 0) + (baseLatency ?? 0)
  let time: number
  let source: LatencySource
  if (ts) {
    time = ts.contextTime + (perfNowMs - ts.performanceTime) / 1000
    source = 'outputTimestamp'
    // Firefox reports (currentTime − latency, performance.now() − latency) at the call,
    // so this lands on currentTime and moves in its steps; HeardClock smooths them.
    // Judged at the moment of reading, so a late frame does not change the verdict.
    const atReading =
      ts.contextTime + ((reading.performanceNow ?? perfNowMs) - ts.performanceTime) / 1000
    if (currentTime - atReading < reported / 2) {
      time -= reported
      source = 'outputTimestamp+latency'
    }
  } else if (outputLatency !== undefined && outputLatency > 0) {
    time = currentTime - reported
    source = 'outputLatency'
  } else if (baseLatency !== undefined && baseLatency > 0) {
    time = currentTime - baseLatency
    source = 'baseLatency'
  } else {
    time = currentTime
    source = 'none'
  }
  time = Math.min(time, currentTime) - offsetMs / 1000
  return { time, source, latencySec: currentTime - time }
}

export interface HeardClockOptions {
  /** Share of the difference to the raw estimate corrected per frame. */
  gain: number
  /** A difference larger than this, in seconds, is a jump: follow it at once. */
  snapSec: number
  /** A gap between frames longer than this, in seconds, restarts the estimate. */
  gapSec: number
}

export const DEFAULT_HEARD_CLOCK: HeardClockOptions = { gain: 0.15, snapSec: 0.05, gapSec: 0.25 }

/**
 * Heard time that moves smoothly from frame to frame. Where the raw estimate moves in
 * steps of one audio callback (Firefox, S5), each frame predicts the time from the last
 * one and corrects a share of the difference. After a jump (suspend, resume) or a gap
 * (hidden tab) it takes the raw estimate as it is, so the first frame after a gap is
 * as right as the raw estimate.
 */
export class HeardClock {
  private last: { frameMs: number; time: number } | undefined
  readonly options: HeardClockOptions

  constructor(options: Partial<HeardClockOptions> = {}) {
    this.options = { ...DEFAULT_HEARD_CLOCK, ...options }
  }

  read(reading: ClockReading, frameMs: number, offsetMs = 0): HeardTime {
    const raw = heardTime(reading, frameMs, offsetMs)
    const { gain, snapSec, gapSec } = this.options
    let time = raw.time
    const last = this.last
    if (last) {
      const dt = (frameMs - last.frameMs) / 1000
      const predicted = last.time + dt
      const error = raw.time - predicted
      if (dt > 0 && dt <= gapSec && Math.abs(error) <= snapSec) {
        time = Math.min(predicted + gain * error, reading.currentTime - offsetMs / 1000)
      }
    }
    this.last = { frameMs, time }
    return { time, source: raw.source, latencySec: reading.currentTime - time }
  }

  reset(): void {
    this.last = undefined
  }
}
