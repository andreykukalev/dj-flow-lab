// Mixer DSP measurements for spike S3 (#44): isolator response and kill depth, filter
// sweeps, master headroom and render cost. Each scenario renders the real mixer graph
// (src/audio/mixerGraph.ts) offline and returns numbers; tests/audio/dsp.spec.ts
// asserts on them.
import { CROSSOVER_HIGH_HZ, CROSSOVER_LOW_HZ, MixerGraph } from '../src/audio/mixerGraph'
import {
  FILTER_HP_MIN_HZ,
  FILTER_Q,
  defaultState,
  gainToDb,
  type ControlState,
} from '../src/engine/mixer'
import type { TransitionPlanV1 } from '../src/engine/plan/types'
import { anchorBeatAt, anchorTimeOf, secondsPerBeat, type PlaybackAnchor } from '../src/engine/time'
import { GRID_A, GRID_B, flatPlan, pocPlan, renderEngine } from './engine'
import {
  dftMagnitude,
  centroidOf,
  logFrequencies,
  maxJump,
  powerSpectrum,
  truePeak,
} from './measure'
import { renderOffline, toBuffer } from './render'
import { sine, whiteNoise } from './signals'

const SR = 44100

// ---------------------------------------------------------------------------
// Isolator response

/** Isolator and filter settings to measure; unset values are the mixer's own. */
export interface ChainConfig {
  crossoverHz?: [number, number]
  /** Overrides the bipolar filter's resting high-pass cutoff (D-13: 10 Hz). */
  restHighpassHz?: number
  /** Overrides the resting low-pass cutoff (D-13: Nyquist). */
  restLowpassHz?: number
}

/** Impulse response of deck A's chain (trim → isolator → filters → fader) at a control state. */
async function impulseResponse(
  state: Partial<ControlState>,
  config: ChainConfig = {},
  seconds = 1.5,
) {
  const [ir] = await renderOffline({ sampleRate: SR, seconds }, (ctx) => {
    // The master is left unconnected; deck A's output is tapped directly.
    const mixer = new MixerGraph(ctx, new GainNode(ctx), { crossoverHz: crossovers(config) })
    mixer.applyState({ ...defaultState(), ...state })
    const deck = mixer.decks.A
    if (config.restHighpassHz !== undefined) deck.highpass.frequency.value = config.restHighpassHz
    if (config.restLowpassHz !== undefined) deck.lowpass.frequency.value = config.restLowpassHz
    deck.gate.gain.value = 1
    deck.output.connect(ctx.destination)
    const impulse = new Float32Array(16)
    impulse[0] = 1
    const src = new AudioBufferSourceNode(ctx, { buffer: toBuffer([impulse], SR) })
    src.connect(deck.input)
    src.start(0)
  })
  return ir!
}

function crossovers(config: ChainConfig): [number, number] {
  return config.crossoverHz ?? [CROSSOVER_LOW_HZ, CROSSOVER_HIGH_HZ]
}

/** Unity response: every control at its default, deck A at full level, 20 Hz–18 kHz. */
export async function unityResponse(config: ChainConfig = {}) {
  const freqs = logFrequencies(20, 18000, 121) // 1/12 octave
  const ir = await impulseResponse({}, config)
  const db = freqs.map((f) => gainToDb(dftMagnitude(ir, f, SR)))
  const pick = (better: (a: number, b: number) => boolean) =>
    db.reduce((w, v, i) => (better(v, w.db) ? { db: round(v, 3), hz: Math.round(freqs[i]!) } : w), {
      db: round(db[0]!, 3),
      hz: 20,
    })
  return {
    config: {
      crossoverHz: crossovers(config),
      restHighpassHz: config.restHighpassHz ?? FILTER_HP_MIN_HZ,
    },
    max: pick((a, b) => a > b),
    min: pick((a, b) => a < b),
  }
}

/** Attenuation of each band at its kill position, relative to unity. */
export async function killDepth(config: ChainConfig = {}) {
  const [lowHz, highHz] = crossovers(config)
  const unity = await impulseResponse({}, config)
  const killed = {
    low: await impulseResponse({ 'A.eqLow': 0 }, config),
    mid: await impulseResponse({ 'A.eqMid': 0 }, config),
    high: await impulseResponse({ 'A.eqHigh': 0 }, config),
  }
  const attenuation = (ir: Float32Array, hz: number) =>
    gainToDb(dftMagnitude(unity, hz, SR)) - gainToDb(dftMagnitude(ir, hz, SR))
  const at = (ir: Float32Array, list: number[]) =>
    list.map((hz) => ({ hz: Math.round(hz), db: round(attenuation(ir, hz), 1) }))

  // The low kill, every hertz from 20 to 100 Hz, and how far up it reaches 40 dB.
  let worstBelow100Hz = Infinity
  let reaches40DbUpToHz = 0
  let reaching = true
  for (let hz = 20; hz <= lowHz; hz += 1) {
    const a = attenuation(killed.low, hz)
    if (hz <= 100) worstBelow100Hz = Math.min(worstBelow100Hz, a)
    reaching &&= a >= 40
    if (reaching) reaches40DbUpToHz = hz
  }
  const midCentre = Math.sqrt(lowHz * highHz)
  const highCentre = Math.sqrt(highHz * 20000)
  return {
    crossoverHz: [lowHz, highHz],
    low: {
      at: at(killed.low, [40, 60, 80, 100]),
      worstBelow100Hz: round(worstBelow100Hz, 1),
      reaches40DbUpToHz,
    },
    mid: {
      centreHz: Math.round(midCentre),
      atCentre: round(attenuation(killed.mid, midCentre), 1),
      at: at(killed.mid, [2 * lowHz, midCentre, highHz / 2]),
    },
    high: {
      centreHz: Math.round(highCentre),
      atCentre: round(attenuation(killed.high, highCentre), 1),
      at: at(killed.high, [2 * highHz, highCentre, 15000]),
    },
  }
}

// ---------------------------------------------------------------------------
// Filter sweeps

const SPB = secondsPerBeat(GRID_A.bpm)
const POINTS_A_START_SEC = GRID_A.anchorSec + 32 * SPB // A's audio at transition beat 0 (bar 9)

/** A plan that sweeps deck A's filter to `to` and back, each way over `beats`. */
function sweepPlan(to: -1 | 1, beats: number): TransitionPlanV1 {
  const start = 1
  return {
    ...flatPlan(start + 2 * beats + 1),
    id: `sweep-${to}-${beats}`,
    initial: { 'A.fader': 1, 'B.fader': 0 },
    events: [
      {
        id: 'out',
        control: 'A.filter',
        kind: 'ramp',
        atBeat: start,
        untilBeat: start + beats,
        to,
      },
      {
        id: 'back',
        control: 'A.filter',
        kind: 'ramp',
        atBeat: start + beats,
        untilBeat: start + 2 * beats,
        to: 0,
      },
    ],
  }
}

/** RMS of the part of a frame between `loHz` and `hiHz`. */
function bandRms(frame: Float32Array, loHz: number, hiHz: number): number {
  const power = powerSpectrum(frame)
  const n = frame.length
  let sum = 0
  for (let k = 1; k < power.length; k++) {
    const hz = (k * SR) / n
    if (hz >= loHz && hz < hiHz) sum += power[k]!
  }
  return Math.sqrt(sum)
}

function frames(data: Float32Array, from: number, to: number, size: number, hop: number) {
  const out: Float32Array[] = []
  for (let i = Math.max(0, Math.floor(from)); i + size <= Math.min(to, data.length); i += hop) {
    out.push(data.subarray(i, i + size))
  }
  return out
}

/**
 * Spectral centroid of `blocks` consecutive blocks of `[from, to)`, each from the power
 * spectrum averaged over its frames, so the randomness of noise averages out.
 */
function blockCentroids(data: Float32Array, from: number, to: number, blocks: number): number[] {
  const length = (to - from) / blocks
  const size = 2 ** Math.min(12, Math.floor(Math.log2(length)))
  return Array.from({ length: blocks }, (_, b) => {
    const list = frames(data, from + b * length, from + (b + 1) * length, size, size / 2)
    const sum = new Float64Array(size / 2 + 1)
    for (const f of list) powerSpectrum(f).forEach((p, k) => (sum[k] = sum[k]! + p))
    return centroidOf(sum, SR)
  })
}

function largestJumpAt(data: Float32Array): number {
  let at = 0
  let max = 0
  for (let i = 1; i < data.length; i++) {
    const d = Math.abs(data[i]! - data[i - 1]!)
    if (d > max) [max, at] = [d, i]
  }
  return at
}

function zipperByBeat(data: Float32Array, anchor: PlaybackAnchor, from: number, to: number) {
  const step = Math.max(0.25, (to - from) / 16)
  const out: { beat: number; dbfs: number }[] = []
  for (let b = from; b < to; b += step) {
    const list = frames(
      data,
      anchorTimeOf(anchor, b) * SR,
      anchorTimeOf(anchor, b + step) * SR,
      1024,
      512,
    )
    const worst = Math.max(1e-12, ...list.map((f) => bandRms(f, ZIPPER_BAND_HZ, SR / 2)))
    out.push({ beat: round(b, 2), dbfs: round(gainToDb(worst), 1) })
  }
  return out
}

/** Tones for the sweep checks: everything the filter does to them stays below 8 kHz. */
const SWEEP_TONES = [60, 440, 3000]
const SWEEP_TONE_AMPLITUDE = 0.3
/** Above this frequency the swept tones have no energy: what is there is zipper noise. */
const ZIPPER_BAND_HZ = 8000

/**
 * Equal-amplitude tones a third of an octave apart from 31.5 Hz to 16 kHz, with fixed
 * phases: a deterministic stand-in for pink noise, so the centroid of each block
 * depends on the filter and not on the randomness of noise.
 */
function multiTone(seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * SR))
  const freqs = logFrequencies(31.5, 16000, 28)
  freqs.forEach((f, j) => {
    const w = (2 * Math.PI * f) / SR
    const phase = (j * 2.399963) % (2 * Math.PI) // golden-angle phases keep the crest factor low
    for (let i = 0; i < out.length; i++)
      out[i]! += (0.6 / Math.sqrt(freqs.length)) * Math.sin(w * i + phase)
  })
  return out
}

/** Centroid blocks per sweep direction. */
const CENTROID_BLOCKS = 16

/** Peak gain of a 2nd-order low-pass or high-pass at the mixer's filter Q. */
export function filterPeakGain(q = FILTER_Q): number {
  return q > Math.SQRT1_2 ? q / Math.sqrt(1 - 1 / (4 * q * q)) : 1
}

/**
 * P5: sweeps the bipolar filter down (low-pass) or up (high-pass) and back, each way
 * over `beats`, through the scheduler and transport, and measures sample jumps, energy
 * above 8 kHz that the tones cannot produce (zipper noise), and the spectral centroid
 * of a third-octave multi-tone through the same sweep.
 */
export async function filterSweep(to: -1 | 1, beats: number) {
  const plan = sweepPlan(to, beats)
  const seconds = 0.1 + (2 * beats + 2) * SPB
  const deckSeconds = POINTS_A_START_SEC + seconds + 1
  const tones = new Float32Array(Math.ceil(deckSeconds * SR))
  for (const f of SWEEP_TONES) {
    const s = sine(SR, deckSeconds, f, SWEEP_TONE_AMPLITUDE)
    for (let i = 0; i < tones.length; i++) tones[i]! += s[i]!
  }
  const silence = new Float32Array(Math.ceil(60 * SR))
  const render = (a: Float32Array) =>
    renderEngine({
      sampleRate: SR,
      seconds,
      plan,
      signals: { A: a, B: silence },
      steps: [{ at: 0, run: (t, at) => t.startAt(0, at) }],
    })

  const toneRender = await render(tones)
  const anchor = toneRender.anchors[0]!
  const from = anchorTimeOf(anchor, 1) * SR
  const turn = anchorTimeOf(anchor, 1 + beats) * SR
  const until = anchorTimeOf(anchor, 1 + 2 * beats) * SR
  const zipper = frames(toneRender.A, from, until, 2048, 1024).map((f) =>
    bandRms(f, ZIPPER_BAND_HZ, SR / 2),
  )
  const maxSlope = SWEEP_TONES.reduce(
    (s, f) => s + (SWEEP_TONE_AMPLITUDE * 2 * Math.PI * f) / SR,
    0,
  )
  let peak = 0
  let finite = true
  for (const v of toneRender.A) {
    if (!Number.isFinite(v)) finite = false
    peak = Math.max(peak, Math.abs(v))
  }

  const noiseRender = await render(multiTone(deckSeconds))
  // Centroid against the sweep's direction on each way: the low-pass sweep lowers it
  // then raises it, the high-pass sweep the opposite.
  const centroids = (a: number, b: number) => blockCentroids(noiseRender.A, a, b, CENTROID_BLOCKS)
  const against = (list: number[], direction: 1 | -1) =>
    list.slice(1).reduce((w, c, i) => Math.max(w, (-direction * (c - list[i]!)) / list[i]!), 0)
  const outward = centroids(from, turn)
  const inward = centroids(turn, until)
  const outDirection = to === -1 ? -1 : 1

  return {
    to,
    beats,
    seconds: round(beats * SPB, 3),
    finite,
    peak: round(peak, 4),
    inputPeak: round(SWEEP_TONE_AMPLITUDE * SWEEP_TONES.length, 4),
    filterPeakGain: round(filterPeakGain(), 4),
    maxJump: round(maxJump(toneRender.A), 5),
    /** Transition beat of the largest jump, and the zipper level per beat of the sweep. */
    maxJumpAtBeat: round(anchorBeatAt(anchor, largestJumpAt(toneRender.A) / SR), 3),
    zipperByBeat: zipperByBeat(toneRender.A, anchor, 1, 1 + 2 * beats),
    jumpThreshold: round(maxSlope * filterPeakGain() + 0.01, 5),
    zipperDbfs: round(gainToDb(Math.max(1e-12, ...zipper)), 1),
    centroid: {
      outwardHz: outward.map(Math.round),
      inwardHz: inward.map(Math.round),
      maxAgainstOutward: round(against(outward, outDirection), 4),
      maxAgainstInward: round(against(inward, outDirection === 1 ? -1 : 1), 4),
      blocks: CENTROID_BLOCKS,
    },
  }
}

// ---------------------------------------------------------------------------
// Headroom

/**
 * A synthetic stand-in for a loud house master: kick on every beat, off-beat bass,
 * 16th-note hats and a pad, soft-clipped to a −0.3 dBFS sample peak. Real masters are
 * checked by ear (P9); this checks what beat-aligned kicks do to the sum.
 */
export function loudTrack(
  bpm: number,
  firstBeatSec: number,
  seconds: number,
  seed: number,
  drive = 3,
) {
  const n = Math.ceil(seconds * SR)
  const out = new Float32Array(n)
  const noise = whiteNoise(SR, seconds, 1, seed)
  const beat = secondsPerBeat(bpm)
  const rand = whiteNoise(SR, 0.01, 0.5, seed + 100).map((v) => v + 0.5) // 0…1 values
  const kickEnd = 40 + 20 * rand[0]!
  const bassHz = 41.2 * 2 ** (Math.floor(rand[1]! * 7) / 12)
  const padHz = [220, 277.2, 329.6].map((f) => f * 2 ** (Math.floor(rand[2]! * 5) / 12))
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const tb = t - firstBeatSec
    let v = 0
    if (tb >= 0) {
      const inBeat = tb % beat
      // Kick: pitch falling from 150 Hz, 250 ms decay; phase is the integral of frequency.
      const phase =
        2 * Math.PI * (kickEnd * inBeat + (150 - kickEnd) * 0.03 * (1 - Math.exp(-inBeat / 0.03)))
      v += Math.sin(phase) * Math.exp(-inBeat / 0.25)
      const offbeat = (tb + beat / 2) % beat
      v += 0.6 * Math.sin(2 * Math.PI * bassHz * offbeat) * Math.exp(-offbeat / 0.15)
      const sixteenth = tb % (beat / 4)
      v += 0.25 * (noise[i]! - (noise[i - 1] ?? 0)) * Math.exp(-sixteenth / 0.03)
    }
    for (const f of padHz) v += 0.08 * Math.sin(2 * Math.PI * f * t)
    out[i] = v
  }
  let max = 0
  for (const v of out) max = Math.max(max, Math.abs(v))
  const ceiling = 10 ** (-0.3 / 20)
  for (let i = 0; i < n; i++)
    out[i] = (ceiling * Math.tanh((drive * out[i]!) / max)) / Math.tanh(drive)
  return out
}

export interface HeadroomOptions {
  /** Soft-clip drive of the synthetic masters: 3 is very loud, 1.5 loud. */
  drive: number
  /**
   * `full`: both faders up, crossfader centred, EQ neutral, for 8 bars (the worst case).
   * `longBlend`: the proof-of-concept plan's 32-bar overlap, where the bass swap keeps
   * one deck's low band out at any time.
   */
  mix: 'full' | 'longBlend'
}

/** Sample and true peak of the master when two loud masters play beat-aligned. */
export async function headroom(pair: number, options: Partial<HeadroomOptions> = {}) {
  const { drive, mix }: HeadroomOptions = { drive: 3, mix: 'full', ...options }
  const plan = mix === 'full' ? flatPlan(32) : pocPlan()
  const [fromBeat, toBeat] = mix === 'full' ? [0, 32] : [0, 128]
  const seconds = 0.1 + (toBeat - fromBeat) * SPB
  // Both tracks cover the whole plan (validation requires it), rate-matched for B.
  const end = plan.span.endBeat
  const a = loudTrack(
    GRID_A.bpm,
    GRID_A.anchorSec,
    POINTS_A_START_SEC + end * SPB + 1,
    2 * pair + 1,
    drive,
  )
  const b = loudTrack(
    GRID_B.bpm,
    GRID_B.anchorSec,
    GRID_B.anchorSec + end * secondsPerBeat(GRID_B.bpm) + 1,
    2 * pair + 2,
    drive,
  )
  const r = await renderEngine({
    sampleRate: SR,
    seconds,
    plan,
    signals: { A: a, B: b },
    steps: [{ at: 0, run: (t, at) => t.startAt(fromBeat, at) }],
  })
  const rmsDb = (data: Float32Array) => {
    let sum = 0
    for (const v of data) sum += v * v
    return round(gainToDb(Math.sqrt(sum / data.length)), 1)
  }
  const samplePeak = (data: Float32Array) => data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const tp = (data: Float32Array) => round(gainToDb(truePeak(data)), 2)
  return {
    pair,
    drive,
    mix,
    inputRmsDbfs: [rmsDb(a), rmsDb(b)],
    inputTruePeakDbfs: [tp(a), tp(b)],
    /** Each deck after its chain, before the master gain. */
    deckTruePeakDbfs: [tp(r.A), tp(r.B)],
    masterSamplePeakDbfs: round(gainToDb(samplePeak(r.master)), 2),
    masterTruePeakDbfs: tp(r.master),
    masterRmsDbfs: rmsDb(r.master),
  }
}

// ---------------------------------------------------------------------------
// Render cost

/** Wall time to render the whole proof-of-concept plan offline, as a multiple of real time. */
export async function renderCost() {
  const plan = pocPlan()
  const seconds = (plan.span.endBeat - plan.span.startBeat) * SPB + 0.1
  const signals = { A: whiteNoise(SR, 120, 0.3, 1), B: whiteNoise(SR, 120, 0.3, 2) }
  const t0 = performance.now()
  await renderEngine({
    sampleRate: SR,
    seconds,
    plan,
    signals,
    steps: [{ at: 0, run: (t, at) => t.startAt(plan.span.startBeat, at) }],
  })
  const wallSec = (performance.now() - t0) / 1000
  return {
    audioSec: round(seconds, 1),
    wallSec: round(wallSec, 2),
    realtimeFactor: round(seconds / wallSec, 1),
  }
}

function round(x: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(x * f) / f
}
