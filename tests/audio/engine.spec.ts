import { expect, test, type TestInfo } from '@playwright/test'
import type {} from '../../harness/main'

// S1 (#42): the two-deck engine on the real transport, mixer and scheduler, rendered
// offline. Pass/fail criteria P1–P4 and P6 from docs/TECHNICAL_SPIKES.md; results are
// recorded in the "S1 result" section there.
//
// Firefox rounds the output rate of a resampled source to whole hertz, so deck B runs
// up to ~1.2e-5 fast or slow there. The scenarios report raw numbers and numbers with
// that known error removed; Chromium must meet the criteria on raw numbers, Firefox on
// corrected numbers, with its raw drift bounded by the rounding model.

test.describe.configure({ timeout: 180_000 })

const SAMPLE = 1
const QUANTUM_MS = (128 / 44100) * 1000

test.beforeEach(async ({ page }) => {
  await page.goto('/harness/')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
})

function record(info: TestInfo, result: unknown) {
  info.annotations.push({ type: 'measurement', description: JSON.stringify(result) })
}

const isFirefox = (info: TestInfo) => info.project.name === 'firefox'

test('P1: decks stay aligned over 64 bars at 124 vs 120 BPM', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.engine.interDeckAlignment())
  record(info, r)
  expect(r.compared).toBe(256)
  expect(r.maxResidualMs).toBeLessThanOrEqual(0.01)
  if (isFirefox(info)) {
    expect(r.maxOffsetMs).toBeLessThanOrEqual(r.predictedDriftMs + 0.01)
  } else {
    expect(r.resamplerTempoError).toBe(0)
    expect(r.maxOffsetMs).toBeLessThanOrEqual(1)
  }
})

// CI runs the first seed; the others are @slow.
for (const seed of [1, 2, 3]) {
  const tag = seed > 1 ? ['@slow'] : []
  test(
    `P2: 100 random seeks leave timing and mixer state as in a play-through (seed ${seed})`,
    {
      tag,
    },
    async ({ page }, info) => {
      const r = await page.evaluate((s) => window.harness.engine.seekDeterminism(s), seed)
      record(info, r)
      for (const deck of ['A', 'B'] as const) {
        const o = r.onsets[deck]
        expect(o.compared, `onsets compared on deck ${deck}`).toBeGreaterThanOrEqual(16)
        expect(o.maxCorrectedSamples).toBeLessThanOrEqual(SAMPLE)
        if (!isFirefox(info)) expect(o.maxSamples).toBeLessThanOrEqual(SAMPLE)
        // Levels of 0.5-amplitude tones: within 2.5e-4 (−66 dB). Biquad filters keep the
        // history of a frequency sweep, so levels differ slightly where a filter moves;
        // the parameters themselves match stateAt within 1e-4 (probes, below).
        expect(r.maxLevelError[deck].max).toBeLessThanOrEqual(2.5e-4)
      }
      if (r.probesSupported) expect(r.maxControlError).toBeLessThanOrEqual(1e-4)
    },
  )
}

test('P3: 50 pause/resume cycles add no offset', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.engine.pauseResume())
  record(info, r)
  for (const deck of ['A', 'B'] as const) {
    const o = r.onsets[deck]
    expect(o.compared).toBeGreaterThanOrEqual(16)
    expect(o.maxCorrectedSamples).toBeLessThanOrEqual(SAMPLE)
    if (!isFirefox(info)) expect(o.maxSamples).toBeLessThanOrEqual(SAMPLE)
  }
})

test('P4: the bass swap happens on the handoff downbeat', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.engine.bassSwapTiming())
  record(info, r)
  expect(Math.abs(r.crossingOffsetMs)).toBeLessThanOrEqual(QUANTUM_MS + 5)
  expect(r.levelsBefore.A).toBeGreaterThan(0.5)
  expect(r.levelsBefore.B).toBeLessThan(0.05)
  expect(r.levelsAfter.A).toBeLessThan(0.05)
  expect(r.levelsAfter.B).toBeGreaterThan(0.5)
})

test('P6: no clicks at steps, starts, stops, seeks and pauses', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.engine.declicking())
  record(info, r)
  expect(r.maxJump.A).toBeLessThanOrEqual(r.threshold)
  expect(r.maxJump.B).toBeLessThanOrEqual(r.threshold)
  expect(r.maxJump.master).toBeLessThanOrEqual(r.threshold)
})

test('real-time playback follows the anchor @realtime', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.engine.realtimeTiming(3))
  record(info, r)
  expect(r.state).toBe('running')
  expect(r.onsets).toBeGreaterThanOrEqual(r.expectedOnsets - 1)
  // The capture (ScriptProcessorNode) time-stamps its buffers in whole render quanta,
  // and that stamping jitters, so each onset's deviation from the anchor is a whole
  // number of quanta. What is left after removing it is the engine's own timing error.
  const residuals = r.deviationsMs.map((d) =>
    Math.abs(d - Math.round(d / r.quantumMs) * r.quantumMs),
  )
  expect(Math.max(...residuals)).toBeLessThanOrEqual(0.02)
})

test('loops: every pass on the beat, the right bars, no clicks at the seams (#81)', async ({
  page,
}, info) => {
  const r = await page.evaluate(() => window.harness.engine.loopPlayback())
  record(info, r)
  for (const deck of ['A', 'B'] as const) {
    for (const run of ['through', 'seek'] as const) {
      const o = r[deck][run]
      const what = `deck ${deck}, ${run}`
      expect(o.compared, what).toBeGreaterThanOrEqual(32)
      expect(o.missing, what).toBe(0)
      // Neighbouring bars differ in level by 11 % or more.
      expect(o.maxLevelError, what).toBeLessThanOrEqual(0.03)
      expect(o.maxCorrectedSamples, what).toBeLessThanOrEqual(SAMPLE)
      if (!isFirefox(info)) expect(o.maxSamples, what).toBeLessThanOrEqual(SAMPLE)
    }
    expect(r[deck].maxJump, `deck ${deck} seams`).toBeLessThanOrEqual(r.threshold)
    expect(r[deck].maxJumpWithoutCrossfade, `deck ${deck} hard seams`).toBeGreaterThan(r.threshold)
  }
  // The decks really jump back: A plays its bars 9–10 three times, B its bars 3–4 four times.
  const a = r.A.through.deckBeats
  expect(a.slice(a.indexOf(32), a.indexOf(32) + 25)).toEqual([
    ...[0, 1, 2].flatMap(() => Array.from({ length: 8 }, (_, k) => 32 + k)),
    40,
  ])
  const b = r.B.through.deckBeats
  expect(b.filter((x) => x === 8)).toHaveLength(4)
})
