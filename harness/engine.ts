// Engine scenarios for the S1 integration tests (#42). Each one renders the real
// transport, mixer and scheduler and returns measurements; the Playwright specs in
// tests/audio/engine.spec.ts only assert on the numbers.
import { MixerGraph } from '../src/audio/mixerGraph'
import { Transport, type TransportOptions } from '../src/audio/transport'
import { compile, stateAt } from '../src/engine/plan/compile'
import { longBlendPlan } from '../src/engine/plan/longBlend'
import type { TransitionPlanV1 } from '../src/engine/plan/types'
import { CONTROL_KEYS } from '../src/engine/mixer'
import { DECK_IDS, type BeatGrid, type DeckId, type DeckLoop } from '../src/engine/model'
import { planTiming } from '../src/engine/plan/loop'
import {
  anchorBeatAt,
  anchorTimeOf,
  deckRuns,
  secondsPerBeat,
  transitionBeatToDeckBeat,
  transitionBeatToDeckSec,
  type PlaybackAnchor,
} from '../src/engine/time'
import { maxJump, onsets } from './measure'
import { toBuffer } from './render'
import { sine } from './signals'

export const GRID_A: BeatGrid = {
  bpm: 124,
  anchorSec: 0.1,
  beatsPerBar: 4,
  phraseOffsetBars: 0,
  source: 'user',
}
export const GRID_B: BeatGrid = {
  bpm: 120,
  anchorSec: 0.25,
  beatsPerBar: 4,
  phraseOffsetBars: 0,
  source: 'user',
}
const POINTS = { exitBarA: 9, entryBarB: 1 } // A's exit 32 beats in, so the pre-roll has audio
const DECKS = {
  A: { trackFingerprint: 'synthetic-a', grid: GRID_A },
  B: { trackFingerprint: 'synthetic-b', grid: GRID_B },
}

export function pocPlan(): TransitionPlanV1 {
  return longBlendPlan(DECKS, POINTS)
}

/** Both decks at full level, no events: for pure timing checks. */
export function flatPlan(endBeat: number): TransitionPlanV1 {
  return {
    ...pocPlan(),
    id: 'flat',
    span: { startBeat: 0, endBeat },
    initial: { 'A.fader': 1, 'B.fader': 1 },
    events: [],
    annotations: [],
  }
}

/** Length of the pulse on each beat, in seconds. */
export const PULSE_SEC = 0.0008

/**
 * A smooth pulse (Hann window, 0.8 ms) on every beat of the deck's grid, placed with
 * sub-sample precision, plus an optional quiet tone. Smooth pulses keep their shape
 * through resampling (deck B's rate) and the isolator's phase shifts, so threshold
 * onsets stay comparable; a one-sample click does not.
 */
export function deckSignal(
  grid: BeatGrid,
  sampleRate: number,
  seconds: number,
  toneHz = 0,
): Float32Array {
  const out =
    toneHz > 0
      ? sine(sampleRate, seconds, toneHz, 0.1)
      : new Float32Array(Math.ceil(seconds * sampleRate))
  const beatSec = secondsPerBeat(grid.bpm)
  for (let k = 0; ; k++) {
    const tb = grid.anchorSec + k * beatSec
    if (tb >= seconds) break
    const first = Math.ceil(tb * sampleRate)
    const last = Math.floor((tb + PULSE_SEC) * sampleRate)
    for (let n = first; n <= last && n < out.length; n++) {
      const u = (n / sampleRate - tb) / PULSE_SEC
      out[n]! += 0.5 * (1 - Math.cos(2 * Math.PI * u))
    }
  }
  return out
}

/** A transport action at context time `at`. */
export type Step = { at: number; run: (t: Transport, at: number) => PlaybackAnchor | void }

export interface EngineRender {
  sampleRate: number
  /** Deck A output, deck B output, master. */
  A: Float32Array
  B: Float32Array
  master: Float32Array
  /** Anchors returned by each step, in order. */
  anchors: PlaybackAnchor[]
  /** Whether the engine supports `OfflineAudioContext.suspend` (needed for probes). */
  probesSupported: boolean
  /** Parameter checks: for each probe time, the largest |param.value − expected|. */
  probes: { t: number; beat: number; maxError: number; control: string }[]
}

/**
 * Renders the engine offline. All steps are scripted before rendering, each at its
 * own context time. Where the engine supports `suspend` (Chromium), `probeTimes` read
 * every plan parameter during rendering and compare it with the mapped `stateAt` of
 * the beat rendered at that time.
 */
export async function renderEngine(opts: {
  sampleRate: number
  seconds: number
  plan: TransitionPlanV1
  signals: Record<DeckId, Float32Array>
  steps: Step[]
  probeTimes?: number[]
  transport?: Partial<TransportOptions>
}): Promise<EngineRender> {
  const { sampleRate } = opts
  const ctx = new OfflineAudioContext(3, Math.ceil(opts.seconds * sampleRate), sampleRate)
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 3 })
  merger.connect(ctx.destination)
  const masterTap = new GainNode(ctx)
  masterTap.connect(merger, 0, 2)
  const mixer = new MixerGraph(ctx, masterTap)
  mixer.decks.A.output.connect(merger, 0, 0)
  mixer.decks.B.output.connect(merger, 0, 1)
  const transport = new Transport(ctx, mixer, opts.transport)
  transport.load(opts.plan, {
    A: toBuffer([opts.signals.A], sampleRate),
    B: toBuffer([opts.signals.B], sampleRate),
  })
  const compiled = compile(opts.plan)

  // Script the session, remembering which anchor (if any) is in force from each step on.
  const anchors: PlaybackAnchor[] = []
  const timeline: { at: number; anchor: PlaybackAnchor | undefined }[] = []
  for (const step of [...opts.steps].sort((a, b) => a.at - b.at)) {
    step.run(transport, step.at)
    const state = transport.state
    const anchor = state.kind === 'playing' ? state.anchor : undefined
    if (anchor && anchor !== timeline.at(-1)?.anchor) anchors.push(anchor)
    timeline.push({ at: step.at, anchor })
  }

  const probes: EngineRender['probes'] = []
  const probesSupported = typeof (ctx as { suspend?: unknown }).suspend === 'function'
  if (probesSupported) {
    const quantum = 128 / sampleRate
    const quanta = new Set((opts.probeTimes ?? []).map((t) => Math.max(1, Math.round(t / quantum))))
    for (const q of quanta) {
      void ctx.suspend(q * quantum).then(() => {
        const t = ctx.currentTime
        const anchor = timeline.findLast((e) => e.at <= t)?.anchor
        if (anchor && t >= anchor.ctxTime + transport.options.fadeSec) {
          const beat = anchorBeatAt(anchor, t)
          const expected = stateAt(compiled, beat)
          let worst = { maxError: 0, control: '' }
          for (const key of CONTROL_KEYS) {
            for (const { param, map } of mixer.targetsOf(key)) {
              const want = map(expected[key])
              // Frequencies are compared relative to their value, gains absolutely.
              const err = Math.abs(param.value - want) / Math.max(1, Math.abs(want))
              if (err > worst.maxError) worst = { maxError: err, control: key }
            }
          }
          probes.push({ t, beat, ...worst })
        }
        return ctx.resume()
      })
    }
  }
  const rendered = await ctx.startRendering()
  return {
    sampleRate,
    A: rendered.getChannelData(0),
    B: rendered.getChannelData(1),
    master: rendered.getChannelData(2),
    anchors,
    probesSupported,
    probes,
  }
}

/** Threshold for pulse onsets after the mixer chain (pulse peaks are ≈ 0.68 at unity; the
 * quiet tone stays below 0.1). */
export const ONSET_THRESHOLD = 0.2

/** Onset times (context seconds) of one channel, keyed by the transition beat they belong to. */
export function onsetsByBeat(
  data: Float32Array,
  sampleRate: number,
  anchor: PlaybackAnchor,
  fromTime = 0,
): Map<number, number> {
  const out = new Map<number, number>()
  // The isolator's phase shifts change the pulse's shape and polarity identically in
  // every render, so onsets are taken on |x| at a threshold below its smallest peak.
  const rectified = data.map(Math.abs)
  for (const s of onsets(rectified, ONSET_THRESHOLD, 2000)) {
    const t = s / sampleRate
    if (t >= fromTime) out.set(Math.round(anchorBeatAt(anchor, t)), t)
  }
  return out
}

/**
 * Relative tempo error of a resampled source: effective rate / requested rate − 1.
 * Firefox rounds the resampler's output rate to whole hertz (found in S1), so deck B
 * runs slightly fast or slow; Chromium plays the exact rate.
 */
export function resamplerTempoError(rate: number, sampleRate: number): number {
  if (rate === 1 || !navigator.userAgent.includes('Firefox')) return 0
  const outHz = sampleRate / rate
  return outHz / Math.round(outHz) - 1
}

const TIMING = { gridA: GRID_A, gridB: GRID_B, ...POINTS }
export const RATE_B = GRID_A.bpm / GRID_B.bpm

/**
 * Where an onset of deck B would be without the resampler's tempo error: the error
 * accumulates from the moment the deck's source started.
 */
function withoutDrift(t: number, anchor: PlaybackAnchor, tempoError: number): number {
  const offset = transitionBeatToDeckSec(TIMING, 'B', anchor.beat)
  const start = anchor.ctxTime + Math.max(0, -offset / RATE_B)
  return t + tempoError * (t - start)
}

/**
 * Timing difference, in samples, between two renders for every beat heard in both:
 * each onset is measured against the time its own render's anchor gives that beat.
 * For deck B, `corrected` first removes the resampler's known tempo error.
 */
export function compareOnsets(
  deck: DeckId,
  test: Map<number, number>,
  testAnchor: PlaybackAnchor,
  ref: Map<number, number>,
  refAnchor: PlaybackAnchor,
): { raw: number[]; corrected: number[] } {
  const eps = deck === 'B' ? resamplerTempoError(RATE_B, SR) : 0
  const raw: number[] = []
  const corrected: number[] = []
  for (const [beat, t] of test) {
    const r = ref.get(beat)
    if (r === undefined) continue
    const ideal = (t0: number, t1: number) =>
      (t0 - anchorTimeOf(testAnchor, beat) - (t1 - anchorTimeOf(refAnchor, beat))) * SR
    raw.push(Math.abs(ideal(t, r)))
    corrected.push(
      Math.abs(ideal(withoutDrift(t, testAnchor, eps), withoutDrift(r, refAnchor, eps))),
    )
  }
  return { raw, corrected }
}

/** Largest onset errors per deck between a test render and a reference. */
function onsetErrors(test: EngineRender, ref: EngineRender, from: number) {
  const testAnchor = test.anchors.at(-1)!
  const refAnchor = ref.anchors[0]!
  const out = {} as Record<
    DeckId,
    { compared: number; maxSamples: number; maxCorrectedSamples: number }
  >
  for (const deck of DECK_IDS) {
    const { raw, corrected } = compareOnsets(
      deck,
      onsetsByBeat(test[deck], SR, testAnchor, from),
      testAnchor,
      onsetsByBeat(ref[deck], SR, refAnchor),
      refAnchor,
    )
    out[deck] = {
      compared: raw.length,
      maxSamples: Math.max(0, ...raw),
      maxCorrectedSamples: Math.max(0, ...corrected),
    }
  }
  return out
}

/** Tones used for envelope comparisons; deck B's is heard at its playback rate. */
export const TONE_HZ = { A: 330, B: 550 } as const

export function toneSignals(seconds: number): Record<DeckId, Float32Array> {
  return { A: sine(SR, seconds, TONE_HZ.A, 0.5), B: sine(SR, seconds, TONE_HZ.B, 0.5) }
}

/**
 * Largest difference in level per deck (and where) between two renders of the tone signals, at every 1/16
 * beat of `[fromBeat, toBeat]`. Level is the instantaneous amplitude of each deck's
 * tone, read at the time each render's anchor gives the beat. This checks that the
 * mixer state after seeks or pauses is the play-through state.
 */
export function compareLevels(
  test: EngineRender,
  testAnchor: PlaybackAnchor,
  ref: EngineRender,
  refAnchor: PlaybackAnchor,
  fromBeat: number,
  toBeat: number,
): Record<DeckId, { max: number; beat: number }> {
  const worst = { A: { max: 0, beat: fromBeat }, B: { max: 0, beat: fromBeat } }
  for (const deck of DECK_IDS) {
    const hz = TONE_HZ[deck] * (deck === 'B' ? GRID_A.bpm / GRID_B.bpm : 1)
    // Averaging over four cycles removes the ripple deck B's resampling adds.
    const cycles = Math.round((4 * SR) / hz)
    const envTest = movingAverage(envelope(test[deck], hz, SR), cycles)
    const envRef = movingAverage(envelope(ref[deck], hz, SR), cycles)
    for (let beat = fromBeat; beat <= toBeat; beat += 1 / 16) {
      const a = sampleAt(envTest, anchorTimeOf(testAnchor, beat) * SR)
      const b = sampleAt(envRef, anchorTimeOf(refAnchor, beat) * SR)
      if (Math.abs(a - b) > worst[deck].max) worst[deck] = { max: Math.abs(a - b), beat }
    }
  }
  return worst
}

/** Centred moving average over `n` samples. */
function movingAverage(data: Float32Array, n: number): Float32Array {
  const out = new Float32Array(data.length)
  const half = Math.floor(n / 2)
  let sum = 0
  for (let i = 0; i < data.length + half; i++) {
    if (i < data.length) sum += data[i]!
    if (i - n >= 0) sum -= data[i - n]!
    if (i - half >= 0 && i - half < data.length) out[i - half] = sum / n
  }
  return out
}

function sampleAt(data: Float32Array, index: number): number {
  const i = Math.floor(index)
  const f = index - i
  return (data[i] ?? 0) * (1 - f) + (data[i + 1] ?? 0) * f
}

// ---------------------------------------------------------------------------
// Scenarios

const SR = 44100

/** P1: inter-deck alignment over 64 bars, 124 vs 120 BPM click tracks. */
export async function interDeckAlignment() {
  const beats = 256
  const plan = flatPlan(beats)
  const seconds = 0.03 + beats * secondsPerBeat(124) + 0.3
  const r = await renderEngine({
    sampleRate: SR,
    seconds,
    plan,
    signals: {
      A: deckSignal(GRID_A, SR, 150),
      B: deckSignal(GRID_B, SR, 140),
    },
    steps: [{ at: 0, run: (t, at) => t.startAt(0, at) }],
  })
  const anchor = r.anchors[0]!
  const a = onsetsByBeat(r.A, SR, anchor)
  const b = onsetsByBeat(r.B, SR, anchor)
  const eps = resamplerTempoError(RATE_B, SR)
  let maxOffset = 0
  let maxResidual = 0
  let compared = 0
  const latency: number[] = []
  for (const [beat, tA] of a) {
    latency.push((tA - anchorTimeOf(anchor, beat)) * SR)
    const tB = b.get(beat)
    if (tB === undefined) continue
    compared++
    maxOffset = Math.max(maxOffset, Math.abs(tA - tB))
    maxResidual = Math.max(maxResidual, Math.abs(tA - withoutDrift(tB, anchor, eps)))
  }
  return {
    beats,
    compared,
    maxOffsetMs: maxOffset * 1000,
    resamplerTempoError: eps,
    predictedDriftMs: Math.abs(eps) * beats * secondsPerBeat(GRID_A.bpm) * 1000,
    /** Offset left once the resampler's known tempo error is removed. */
    maxResidualMs: maxResidual * 1000,
    // Pulse onset (threshold crossing) and chain delay, relative to the anchor's schedule.
    latencySamples: { min: Math.min(...latency), max: Math.max(...latency) },
  }
}

/** P2: 100 random seeks, then 8 bars of playback compared with a play-through. */
export async function seekDeterminism(seed = 1) {
  const plan = pocPlan()
  const rnd = mulberry(seed)
  const signals = { A: deckSignal(GRID_A, SR, 200, 330), B: deckSignal(GRID_B, SR, 200, 550) }

  // Reference: play the whole plan from the start.
  const refSeconds = 0.03 + 192 * secondsPerBeat(124) + 0.2
  const ref = await renderEngine({
    sampleRate: SR,
    seconds: refSeconds,
    plan,
    signals,
    steps: [{ at: 0, run: (t, at) => t.startAt(-32, at) }],
  })

  const steps: Step[] = []
  let at = 0
  for (let i = 0; i < 100; i++) {
    const beat = -32 + Math.round(rnd() * 150 * 64) / 64 // includes mid-ramp beats
    steps.push({ at, run: (t, at) => t.startAt(beat, at) })
    at += 0.05 + rnd() * 0.25
  }
  // The last seek lands in the middle of ramps, where both decks are loud enough to time.
  const finalBeat = 24 + Math.round(rnd() * 32 * 64) / 64 + 0.013
  steps.push({ at, run: (t, at) => t.startAt(finalBeat, at) })
  const playStart = at
  const playSeconds = 32 * secondsPerBeat(124)
  const probeTimes = Array.from({ length: 64 }, (_, k) => playStart + 0.05 + (k / 64) * playSeconds)
  const test = await renderEngine({
    sampleRate: SR,
    seconds: playStart + 0.05 + playSeconds,
    plan,
    signals,
    steps,
    probeTimes,
  })
  const onsetsAfterSeek = onsetErrors(test, ref, test.anchors.at(-1)!.ctxTime + 0.011)
  // Mixer state: the same session with plain tones, compared with a play-through.
  const toneRef = await renderEngine({
    sampleRate: SR,
    seconds: refSeconds,
    plan,
    signals: toneSignals(200),
    steps: [{ at: 0, run: (t, at) => t.startAt(-32, at) }],
  })
  const toneTest = await renderEngine({
    sampleRate: SR,
    seconds: playStart + 0.05 + playSeconds,
    plan,
    signals: toneSignals(200),
    steps,
  })
  const maxLevelError = compareLevels(
    toneTest,
    toneTest.anchors.at(-1)!,
    toneRef,
    toneRef.anchors[0]!,
    finalBeat + 1, // after the filters' start-up transients (10 Hz high-pass: τ ≈ 30 ms)
    finalBeat + 31.75,
  )
  return {
    finalBeat,
    maxLevelError,
    probesSupported: test.probesSupported,
    onsets: onsetsAfterSeek,
    maxControlError: Math.max(0, ...test.probes.map((p) => p.maxError)),
    worstProbe: test.probes.reduce<EngineRender['probes'][number] | undefined>(
      (w, p) => (!w || p.maxError > w.maxError ? p : w),
      undefined,
    ),
  }
}

/** P3: 50 pause/resume cycles during the overlap; no cumulative offset. */
export async function pauseResume(seed = 2) {
  const plan = pocPlan()
  const rnd = mulberry(seed)
  const signals = { A: deckSignal(GRID_A, SR, 200, 330), B: deckSignal(GRID_B, SR, 200, 550) }
  const ref = await renderEngine({
    sampleRate: SR,
    seconds: 0.03 + 192 * secondsPerBeat(124) + 0.2,
    plan,
    signals,
    steps: [{ at: 0, run: (t, at) => t.startAt(-32, at) }],
  })
  // Start at the overlap (beat 0) and pause/resume 50 times.
  const steps: Step[] = [{ at: 0, run: (t, at) => t.startAt(0, at) }]
  let at = 0.3
  for (let i = 0; i < 50; i++) {
    steps.push({ at, run: (t, at) => t.pause(at) })
    at += 0.05 + rnd() * 0.2
    steps.push({ at, run: (t, at) => t.resume(at) })
    at += 0.2 + rnd() * 0.5
  }
  const total = at + 32 * secondsPerBeat(124)
  const test = await renderEngine({ sampleRate: SR, seconds: total, plan, signals, steps })
  const finalAnchor = test.anchors.at(-1)!
  return {
    cycles: 50,
    finalBeat: finalAnchor.beat,
    onsets: onsetErrors(test, ref, finalAnchor.ctxTime + 0.011),
  }
}

/** Instantaneous amplitude of a sine-like signal: sqrt(x² + (x′/ω)²). */
function envelope(data: Float32Array, freqHz: number, sampleRate: number): Float32Array {
  const out = new Float32Array(data.length)
  const w = (2 * Math.PI * freqHz) / sampleRate
  for (let i = 1; i < data.length - 1; i++) {
    const x = data[i]!
    const dx = (data[i + 1]! - data[i - 1]!) / 2 / w
    out[i] = Math.sqrt(x * x + dx * dx)
  }
  return out
}

/** P4: the low-band envelopes of the two decks cross at the handoff downbeat. */
export async function bassSwapTiming() {
  const plan = pocPlan()
  const rate = 124 / 120
  const r = await renderEngine({
    sampleRate: SR,
    seconds: 0.03 + 16 * secondsPerBeat(124),
    plan,
    signals: { A: sine(SR, 100, 100), B: sine(SR, 100, 100) },
    steps: [{ at: 0, run: (t, at) => t.startAt(56, at) }],
  })
  const anchor = r.anchors[0]!
  const envA = envelope(r.A, 100, SR)
  const envB = envelope(r.B, 100 * rate, SR)
  const handoff = anchorTimeOf(anchor, 64)
  const searchFrom = Math.floor((handoff - 0.1) * SR)
  let crossing = -1
  for (let i = searchFrom; i < envA.length; i++) {
    if (envB[i]! > envA[i]!) {
      crossing = i
      break
    }
  }
  const before = Math.floor((handoff - 0.05) * SR)
  const after = Math.floor((handoff + 0.1) * SR)
  return {
    crossingOffsetMs: (crossing / SR - handoff) * 1000,
    levelsBefore: { A: envA[before]!, B: envB[before]! },
    levelsAfter: { A: envA[after]!, B: envB[after]! },
  }
}

/** P6: no discontinuities at steps, starts, stops, seeks and pauses. */
export async function declicking() {
  const plan = pocPlan()
  const tone = (freqs: number[]) => {
    const out = new Float32Array(Math.ceil(200 * SR))
    for (const f of freqs) {
      const s = sine(SR, 200, f, 0.5)
      for (let i = 0; i < out.length; i++) out[i]! += s[i]!
    }
    return out
  }
  const freqs = [100, 1000]
  const spb = secondsPerBeat(124)
  const steps: Step[] = [
    { at: 0, run: (t, at) => t.startAt(60, at) }, // plays through the bass swap at 64
    { at: 8 * spb, run: (t, at) => t.startAt(20.37, at) }, // seek into the middle of ramps
    { at: 10 * spb, run: (t, at) => t.pause(at) },
    { at: 11 * spb, run: (t, at) => t.resume(at) },
    { at: 13 * spb, run: (t, at) => t.startAt(95.9, at) }, // across the start of A's fade-out
    { at: 15.3 * spb, run: (t, at) => t.startAt(-3.1, at) }, // B waits for its audio to start
    { at: 22 * spb, run: (t, at) => t.stop(at) },
    { at: 23 * spb, run: (t, at) => t.startAt(63.5, at) },
  ]
  const r = await renderEngine({
    sampleRate: SR,
    seconds: 30 * spb,
    plan,
    signals: { A: tone(freqs), B: tone(freqs) },
    steps,
  })
  // A unit sine moves at most 2πf/sr per sample; the signals sum two half-amplitude sines.
  const maxSlope = freqs.reduce((s, f) => s + (0.5 * 2 * Math.PI * f) / SR, 0)
  return {
    maxSlope,
    threshold: maxSlope + 0.01,
    maxJump: { A: maxJump(r.A), B: maxJump(r.B), master: maxJump(r.master) },
  }
}

// ---------------------------------------------------------------------------
// Loops (#81)

/** Pulse level on each bar of a coded signal: five levels, so a jump back shows. */
export function barLevel(trackBeat: number): number {
  return 0.5 + 0.1 * (((Math.floor(trackBeat / 4) % 5) + 5) % 5)
}

/** A deck signal whose pulse on each beat has its bar's level (see `barLevel`). */
export function codedSignal(grid: BeatGrid, sampleRate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate))
  const beatSec = secondsPerBeat(grid.bpm)
  for (let k = 0; ; k++) {
    const tb = grid.anchorSec + k * beatSec
    if (tb >= seconds) break
    const first = Math.ceil(tb * sampleRate)
    const last = Math.floor((tb + PULSE_SEC) * sampleRate)
    for (let n = first; n <= last && n < out.length; n++) {
      const u = (n / sampleRate - tb) / PULSE_SEC
      out[n]! += barLevel(k) * 0.5 * (1 - Math.cos(2 * Math.PI * u))
    }
  }
  return out
}

/** Tones for the seam check: no whole number of cycles in a loop, so a hard seam is a step. */
const SEAM_TONES_HZ = [107.3, 1013.7]

/** Both decks lined up at their bar 9; A held from the blend start, B's bars 3–4 played 4 times before it. */
export const LOOP_POINTS = { exitBarA: 9, entryBarB: 9 }
export const LOOPS: Record<DeckId, DeckLoop> = {
  A: { deck: 'A', startBeat: 32, lengthBeats: 8, repeats: 2 },
  B: { deck: 'B', startBeat: 8, lengthBeats: 8, repeats: 3 },
}

function loopPlan(loop: DeckLoop): TransitionPlanV1 {
  return { ...flatPlan(40), points: LOOP_POINTS, span: { startBeat: -64, endBeat: 40 }, loop }
}

/**
 * Onsets of a looped deck after the last anchor: the deck beat each one should be
 * (from the plan's map), how far it is from the anchor's time once the chain's constant
 * delay is removed, and whether its level is that beat's bar level.
 */
function loopOnsets(r: EngineRender, plan: TransitionPlanV1, deck: DeckId, fromBeat: number) {
  const anchor = r.anchors.at(-1)!
  const timing = planTiming(plan)
  const data = r[deck]
  const runs = deckRuns(timing, deck)
  const eps = deck === 'B' ? resamplerTempoError(RATE_B, SR) : 0
  const found = [...onsetsByBeat(data, SR, anchor, anchor.ctxTime + 0.011)].filter(
    ([beat]) => beat >= fromBeat,
  )
  const rows = found.map(([beat, onset]) => {
    let t = onset
    const deckBeat = transitionBeatToDeckBeat(timing, deck, beat)
    // The resampler's tempo error builds up from the start of each run's source.
    const run = runs.find((x) => beat < x.to)!
    // A run whose audio starts later than its first beat waits for it, as in the transport.
    const from = Math.max(run.from, anchor.beat)
    const offset = transitionBeatToDeckSec(timing, deck, from)
    const runStart = anchorTimeOf(anchor, from) + Math.max(0, -offset / (deck === 'B' ? RATE_B : 1))
    // Pulses differ in level, so time them by their peak (refined on a parabola), not
    // by where they cross the onset threshold.
    const s = Math.round(t * SR)
    let k = s
    for (let i = s; i < s + PULSE_SEC * SR * 1.5; i++)
      if (Math.abs(data[i] ?? 0) > Math.abs(data[k] ?? 0)) k = i
    const [y0, y1, y2] = [k - 1, k, k + 1].map((i) => Math.abs(data[i] ?? 0)) as [
      number,
      number,
      number,
    ]
    const den = y0 - 2 * y1 + y2
    const peakTime = (k + (den === 0 ? 0 : (0.5 * (y0 - y2)) / den)) / SR
    const peak = y1
    t = peakTime
    return {
      beat,
      deckBeat,
      raw: (t - anchorTimeOf(anchor, beat)) * SR,
      corrected: (t + eps * (t - runStart) - anchorTimeOf(anchor, beat)) * SR,
      level: peak / barLevel(deckBeat),
    }
  })
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const rawOffset = median(rows.map((r) => r.raw))
  const correctedOffset = median(rows.map((r) => r.corrected))
  const gain = median(rows.map((r) => r.level))
  return {
    compared: rows.length,
    /** Deck beats heard, in order: shows the jumps back. */
    deckBeats: rows.map((r) => r.deckBeat),
    maxSamples: Math.max(0, ...rows.map((r) => Math.abs(r.raw - rawOffset))),
    maxCorrectedSamples: Math.max(0, ...rows.map((r) => Math.abs(r.corrected - correctedOffset))),
    /** Largest relative difference between a pulse's level and its bar's: 0.11 or more is another bar. */
    maxLevelError: Math.max(0, ...rows.map((r) => Math.abs(r.level / gain - 1))),
    missing: rows.length === 0 ? 0 : rows.at(-1)!.beat - rows[0]!.beat + 1 - rows.length,
  }
}

/**
 * Loop playback: each deck with its loop, played through and after seeks into a pass.
 * Every pulse must land on the beat the plan's map gives, carry the level of the bar
 * the map says plays there, and the seams must not click.
 */
export async function loopPlayback() {
  const spb = secondsPerBeat(124)
  const signals = { A: codedSignal(GRID_A, SR, 80), B: codedSignal(GRID_B, SR, 80) }
  const out = {} as Record<
    DeckId,
    {
      through: ReturnType<typeof loopOnsets>
      seek: ReturnType<typeof loopOnsets>
      maxJump: number
      maxJumpWithoutCrossfade: number
    }
  >
  for (const deck of DECK_IDS) {
    const plan = loopPlan(LOOPS[deck])
    const through = await renderEngine({
      sampleRate: SR,
      seconds: 0.05 + 104 * spb,
      plan,
      signals,
      steps: [{ at: 0, run: (t, at) => t.startAt(-64, at) }],
    })
    // Seeks: into the middle of a pass, then to just before a jump back.
    const seekBeat = deck === 'A' ? 10.5 : -37.5
    const steps: Step[] = [
      { at: 0, run: (t, at) => t.startAt(-64, at) },
      { at: 2 * spb, run: (t, at) => t.startAt(seekBeat, at) },
      { at: 4 * spb, run: (t, at) => t.startAt(seekBeat - 2.75, at) },
    ]
    const seek = await renderEngine({
      sampleRate: SR,
      seconds: 4 * spb + 0.05 + 40 * spb,
      plan,
      signals,
      steps,
    })
    // Seams with continuous tones: a jump back without a crossfade is a step in the wave.
    const freqs = SEAM_TONES_HZ
    const tone = new Float32Array(Math.ceil(80 * SR))
    for (const f of freqs) {
      const x = sine(SR, 80, f, 0.5)
      for (let i = 0; i < tone.length; i++) tone[i]! += x[i]!
    }
    const toneRender = await renderEngine({
      sampleRate: SR,
      seconds: 0.05 + 104 * spb,
      plan,
      signals: { A: tone, B: tone },
      steps: [{ at: 0, run: (t, at) => t.startAt(-64, at) }],
    })
    // The same without the crossfade, to show the measurement hears a hard seam.
    const hard = await renderEngine({
      sampleRate: SR,
      seconds: 0.05 + 104 * spb,
      plan,
      signals: { A: tone, B: tone },
      steps: [{ at: 0, run: (t, at) => t.startAt(-64, at) }],
      transport: { seamSec: 0 },
    })
    out[deck] = {
      through: loopOnsets(through, plan, deck, -64),
      seek: loopOnsets(seek, plan, deck, -64),
      maxJump: maxJump(toneRender[deck]),
      maxJumpWithoutCrossfade: maxJump(hard[deck]),
    }
  }
  // Deck B plays faster than its file, and so do its tones.
  const maxSlope = SEAM_TONES_HZ.reduce((s, f) => s + (0.5 * 2 * Math.PI * f * RATE_B) / SR, 0)
  return { ...out, threshold: maxSlope + 0.01 }
}

/**
 * Real-time smoke test: plays click tracks on a running AudioContext and captures the
 * output with a ScriptProcessorNode (test-only; deprecated but in every engine), whose
 * `playbackTime` maps captured samples to context time. Returns how far the captured
 * onsets are from the times the anchor predicts.
 */
export async function realtimeTiming(seconds = 3) {
  const ctx = new AudioContext()
  await ctx.resume()
  const sr = ctx.sampleRate
  const mixer = new MixerGraph(ctx)
  const capture = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: { time: number; data: Float32Array }[] = []
  capture.onaudioprocess = (e) => {
    chunks.push({ time: e.playbackTime, data: e.inputBuffer.getChannelData(0).slice() })
  }
  mixer.decks.A.output.connect(capture)
  capture.connect(ctx.destination)
  const transport = new Transport(ctx, mixer)
  const plan = flatPlan(64)
  transport.load(
    { ...plan, initial: { 'A.fader': 1, 'B.fader': 0 } },
    {
      A: toBuffer([deckSignal(GRID_A, sr, 60)], sr),
      B: toBuffer([deckSignal(GRID_B, sr, 60)], sr),
    },
  )
  const anchor = transport.startAt(0)
  await new Promise((r) => setTimeout(r, seconds * 1000))
  transport.stop()
  capture.disconnect()
  const state = ctx.state
  await ctx.close()

  // Stitch the captured chunks into one recording on the context timeline, so a pulse
  // split across two chunks is found once.
  const t0 = chunks[0]?.time ?? 0
  const recording = new Float32Array(Math.ceil((seconds + 1) * sr))
  for (const c of chunks) recording.set(c.data, Math.round((c.time - t0) * sr))
  const found = onsets(recording.map(Math.abs), ONSET_THRESHOLD, 2000).map((s) => t0 + s / sr)
  const quantum = 128 / sr
  // How the capture maps input samples to context time differs between engines, so a
  // constant offset is reported separately; the deviation from it is the timing error.
  const offsets = found.map((t) => t - anchorTimeOf(anchor, Math.round(anchorBeatAt(anchor, t))))
  const sorted = [...offsets].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  return {
    state,
    sampleRate: sr,
    onsets: found.length,
    expectedOnsets: Math.floor((seconds - 0.1) / secondsPerBeat(124)),
    constantOffsetMs: median * 1000,
    maxDeviationMs: Math.max(0, ...offsets.map((o) => Math.abs(o - median))) * 1000,
    deviationsMs: offsets.map((o) => (o - median) * 1000),
    quantumMs: quantum * 1000,
  }
}

function mulberry(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
