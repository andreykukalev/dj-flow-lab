import type { BeatGrid } from '../model'

// A starting tempo and first beat for a whole track (#88), so a collection of tracks can
// be compared before anyone has set a grid by hand. It is a stopgap for #9: the result
// is _likely_, shown as such, and the DJ confirms it or types over it.
//
// One pass makes an onset envelope (rises in the low end and in the whole signal, every
// 5 ms). The tempo is the frequency at which that envelope repeats most strongly over the
// whole track: a coarse search over 78–156 BPM, one tempo per octave, then a fine one
// around the best. The phase at that frequency gives where the beats fall, and the first
// beat with music on it is taken as "the 1".

export interface TempoEstimate {
  bpm: number
  /** File time of the first beat with music on it, taken as a downbeat. */
  anchorSec: number
  /** 0..1: how much of the envelope repeats at this tempo. */
  confidence: number
}

export interface OnsetEnvelope {
  hopSec: number
  values: Float32Array
}

const HOP_SEC = 0.005
const WINDOW_HOPS = 4
const LOW_HZ = 150
export const MIN_BPM = 78
export const MAX_BPM = 156
const COARSE_STEP = 0.1
/** The coarse search listens to at most this much of the middle of a track. */
const COARSE_SEC = 120
const FINE_SPAN = 0.25
const FINE_STEP = 0.002
const DECIMATE = 4
/** A beat has music on it when its onset reaches this share of the typical beat. */
const PRESENT = 0.3
/** A beat's onset is looked for this close to the grid, to refine the phase. */
const NEAR_SEC = 0.03

/** Positive rises of level, in the low end and in the whole signal, every 5 ms. */
export function onsetEnvelope(
  channels: readonly Float32Array[],
  sampleRate: number,
): OnsetEnvelope {
  const n = channels[0]?.length ?? 0
  const hop = Math.max(1, Math.round(sampleRate * HOP_SEC))
  const hops = Math.floor(n / hop)
  const low = new Float64Array(hops)
  const all = new Float64Array(hops)
  const a = 1 - Math.exp((-2 * Math.PI * LOW_HZ) / sampleRate)
  let l1 = 0
  let l2 = 0
  for (let h = 0; h < hops; h++) {
    let sl = 0
    let sa = 0
    for (let i = h * hop; i < (h + 1) * hop; i++) {
      let x = 0
      for (const c of channels) x += c[i]!
      x /= channels.length
      l1 += a * (x - l1)
      l2 += a * (l1 - l2)
      sl += l2 * l2
      sa += x * x
    }
    low[h] = sl
    all[h] = sa
  }
  // Energy over a sliding window of a few hops, in dB, then its positive rises.
  const values = new Float32Array(hops)
  const level = (xs: Float64Array, h: number) => {
    let s = 0
    for (let k = Math.max(0, h - WINDOW_HOPS + 1); k <= h; k++) s += xs[k]!
    return 10 * Math.log10(s / WINDOW_HOPS + 1e-10)
  }
  // The file starts from silence, so music on its first beat is a rise too.
  let prevLow = -100
  let prevAll = -100
  for (let h = 0; h < hops; h++) {
    const l = level(low, h)
    const t = level(all, h)
    values[h] = Math.max(0, l - prevLow) + 0.5 * Math.max(0, t - prevAll)
    prevLow = l
    prevAll = t
  }
  return { hopSec: hop / sampleRate, values }
}

/** The envelope's component at `hz`: its strength and phase, by a rotating sum. */
function component(values: Float32Array, hopSec: number, hz: number): { re: number; im: number } {
  const w = -2 * Math.PI * hz * hopSec
  const c = Math.cos(w)
  const s = Math.sin(w)
  let pr = 1
  let pi = 0
  let re = 0
  let im = 0
  for (let k = 0; k < values.length; k++) {
    const v = values[k]!
    re += v * pr
    im += v * pi
    const nr = pr * c - pi * s
    pi = pr * s + pi * c
    pr = nr
    // Keep the rotation on the unit circle over long tracks.
    if ((k & 1023) === 1023) {
      const m = Math.hypot(pr, pi)
      pr /= m
      pi /= m
    }
  }
  return { re, im }
}

const strength = (values: Float32Array, hopSec: number, bpm: number) => {
  const { re, im } = component(values, hopSec, bpm / 60)
  return Math.hypot(re, im)
}

function decimate(values: Float32Array, by: number): Float32Array {
  const out = new Float32Array(Math.floor(values.length / by))
  for (let k = 0; k < out.length; k++) {
    let s = 0
    for (let j = 0; j < by; j++) s += values[k * by + j]!
    out[k] = s
  }
  return out
}

/** The tempo and first beat of a track from its onset envelope; null for silence. */
export function estimateTempo(env: OnsetEnvelope): TempoEstimate | null {
  const { values, hopSec } = env
  let mean = 0
  for (const v of values) mean += v
  mean /= Math.max(1, values.length)
  if (!(mean > 1e-6)) return null
  const centred = values.map((v) => v - mean)

  // Coarse, on the middle of the track: the beat and its double together, so a groove
  // with off-beat hats or bass still prefers the beat over a tempo between.
  const span = Math.min(centred.length, Math.round(COARSE_SEC / hopSec))
  const middle = Math.floor((centred.length - span) / 2)
  const coarse = decimate(centred.subarray(middle, middle + span), DECIMATE)
  const coarseHop = hopSec * DECIMATE
  const scores: number[] = []
  let best = 0
  for (let k = 0; MIN_BPM + k * COARSE_STEP < MAX_BPM; k++) {
    const bpm = MIN_BPM + k * COARSE_STEP
    scores.push(strength(coarse, coarseHop, bpm) + 0.5 * strength(coarse, coarseHop, 2 * bpm))
    if (scores[k]! > scores[best]!) best = k
  }
  // How far the best tempo stands out from the typical one: noise gives about 2.
  const typicalScore = [...scores].sort((x, y) => x - y)[Math.floor(scores.length / 2)]!
  const standsOut = scores[best]! / Math.max(1e-12, typicalScore)

  // Fine: the beat alone, on the whole envelope, then a parabola through the peak.
  const from = MIN_BPM + best * COARSE_STEP - FINE_SPAN
  const steps = Math.round((2 * FINE_SPAN) / FINE_STEP)
  const fine: number[] = []
  for (let k = 0; k <= steps; k++) fine.push(strength(centred, hopSec, from + k * FINE_STEP))
  let peak = 0
  for (let k = 1; k < fine.length; k++) if (fine[k]! > fine[peak]!) peak = k
  let offset = 0
  if (peak > 0 && peak < fine.length - 1) {
    const [y0, y1, y2] = [fine[peak - 1]!, fine[peak]!, fine[peak + 1]!]
    const d = y0 - 2 * y1 + y2
    if (d < 0) offset = (0.5 * (y0 - y2)) / d
  }
  let period = 60 / (from + (peak + offset) * FINE_STEP)

  // Phase: where the beats fall at that tempo. Then a straight line through the onsets
  // found near the beats, twice, which pins the tempo and phase to the kicks themselves.
  const { re, im } = component(centred, hopSec, 1 / period)
  let first = ((((-Math.atan2(im, re) / (2 * Math.PI)) * period) % period) + period) % period
  const near = Math.round(NEAR_SEC / hopSec)
  const durationSec = values.length * hopSec
  const peakNear = (t: number) => {
    const h = Math.round(t / hopSec)
    let at = Math.max(0, h - near)
    for (let k = at; k <= Math.min(values.length - 1, h + near); k++)
      if (values[k]! > values[at]!) at = k
    return { sec: at * hopSec, value: values[at] ?? 0 }
  }
  for (let pass = 0; pass < 2; pass++) {
    const found: { k: number; sec: number }[] = []
    for (let k = 0; first + k * period < durationSec; k++) {
      const p = peakNear(first + k * period)
      if (p.value > 4 * mean) found.push({ k, sec: p.sec })
    }
    if (found.length < 8) break
    const mk = found.reduce((a, f) => a + f.k, 0) / found.length
    const ms = found.reduce((a, f) => a + f.sec, 0) / found.length
    let num = 0
    let den = 0
    for (const f of found) {
      num += (f.k - mk) * (f.sec - ms)
      den += (f.k - mk) ** 2
    }
    if (!(den > 0)) break
    period = num / den
    first = ms - mk * period
  }
  // The earliest beat, one that falls a hair before the file starts included.
  first = ((first % period) + period) % period
  if (first > period - NEAR_SEC) first -= period
  const bpm = 60 / period

  // "The 1": the first beat with music on it.
  const beats: number[] = []
  for (let t = first; t < durationSec; t += period) beats.push(peakNear(t).value)
  const typical = [...beats].sort((x, y) => x - y)[Math.floor(beats.length / 2)] ?? 0
  const index = Math.max(
    0,
    beats.findIndex((b) => b > 0 && b >= PRESENT * typical),
  )
  const confidence = Math.max(0, Math.min(1, (standsOut - 2) / 8))
  return { bpm, anchorSec: first + index * period, confidence }
}

/** A starting grid from an estimate, marked as the analysis'. */
export function gridFromEstimate(estimate: TempoEstimate): BeatGrid {
  return {
    bpm: Math.round(estimate.bpm * 1000) / 1000,
    anchorSec: estimate.anchorSec,
    beatsPerBar: 4,
    phraseOffsetBars: 0,
    source: 'analysis',
    confidence: estimate.confidence,
  }
}
