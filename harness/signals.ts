/**
 * Deterministic synthetic test signals. Pure functions returning Float32Array,
 * so they can be unit-tested in Node and copied into AudioBuffers in the browser.
 */

export interface ClickTrackOptions {
  sampleRate: number
  seconds: number
  bpm: number
  /** Time of the first click, in seconds. */
  firstBeatSec: number
  amplitude?: number
}

/** Length of each click burst in samples. */
export const CLICK_LENGTH = 64

/**
 * A click on every beat: a single full-amplitude sample followed by a short decay,
 * so the onset is the first sample above half amplitude.
 */
export function clickTrack(opts: ClickTrackOptions): Float32Array {
  const { sampleRate, seconds, bpm, firstBeatSec, amplitude = 1 } = opts
  const out = new Float32Array(Math.ceil(seconds * sampleRate))
  const beatSec = 60 / bpm
  for (let t = firstBeatSec; t < seconds; t += beatSec) {
    const start = Math.round(t * sampleRate)
    for (let k = 0; k < CLICK_LENGTH && start + k < out.length; k++) {
      out[start + k] = amplitude * (k === 0 ? 1 : 0.4 * Math.exp(-k / 8))
    }
  }
  return out
}

/** Expected click positions, in samples, for a click track. */
export function clickPositions(opts: ClickTrackOptions): number[] {
  const positions: number[] = []
  const beatSec = 60 / opts.bpm
  for (let t = opts.firstBeatSec; t < opts.seconds; t += beatSec) {
    positions.push(Math.round(t * opts.sampleRate))
  }
  return positions
}

export function sine(
  sampleRate: number,
  seconds: number,
  freq: number,
  amplitude = 1,
): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate))
  const w = (2 * Math.PI * freq) / sampleRate
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin(w * i)
  return out
}

/** White noise from a seeded generator (mulberry32), so every run is identical. */
export function whiteNoise(
  sampleRate: number,
  seconds: number,
  amplitude = 1,
  seed = 1,
): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate))
  let s = seed >>> 0
  for (let i = 0; i < out.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    out[i] = amplitude * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1)
  }
  return out
}
