import { expect, test, type TestInfo } from '@playwright/test'
import type {} from '../../harness/main'

// S3 (#44): the mixer's DSP, rendered offline through the real mixer graph, scheduler
// and transport. Criteria from docs/TECHNICAL_SPIKES.md (S3 and P5); results are
// recorded in the "S3 result" section there.

test.describe.configure({ timeout: 300_000 })

test.beforeEach(async ({ page }) => {
  await page.goto('/harness/')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
})

function record(info: TestInfo, result: unknown) {
  info.annotations.push({ type: 'measurement', description: JSON.stringify(result) })
}

test('the chain is flat within ±0.5 dB from 20 Hz to 18 kHz at unity', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.dsp.unityResponse())
  record(info, r)
  expect(r.max.db).toBeLessThanOrEqual(0.5)
  expect(r.min.db).toBeGreaterThanOrEqual(-0.5)
})

test('each band kills deeply enough', async ({ page }, info) => {
  const r = await page.evaluate(() => window.harness.dsp.killDepth())
  record(info, r)
  expect(r.low.worstBelow100Hz).toBeGreaterThanOrEqual(40)
  expect(r.mid.atCentre).toBeGreaterThanOrEqual(30)
  expect(r.high.atCentre).toBeGreaterThanOrEqual(30)
})

/** Energy above 8 kHz while sweeping tones below it: inaudible under music (provisional). */
const ZIPPER_LIMIT_DBFS = -60

for (const to of [-1, 1] as const) {
  for (const beats of [32, 4, 1]) {
    test(`P5: ${to < 0 ? 'low-pass' : 'high-pass'} sweep over ${beats} beats and back is clean`, async ({
      page,
    }, info) => {
      const r = await page.evaluate(([t, b]) => window.harness.dsp.filterSweep(t, b), [
        to,
        beats,
      ] as const)
      record(info, r)
      expect(r.finite).toBe(true)
      expect(r.peak).toBeLessThanOrEqual(r.inputPeak * r.filterPeakGain * 1.05)
      expect(r.maxJump).toBeLessThanOrEqual(r.jumpThreshold)
      expect(r.zipperDbfs).toBeLessThanOrEqual(ZIPPER_LIMIT_DBFS)
      // Over 8 bars the centroid moves monotonically. The high-pass's resonance first
      // lifts the lows a little (a dip of ≤ 2%). Shorter sweeps have too few frames per
      // block for a stable centroid, so they are recorded only.
      if (beats === 32) {
        expect(r.centroid.maxAgainstOutward).toBeLessThanOrEqual(0.03)
        expect(r.centroid.maxAgainstInward).toBeLessThanOrEqual(0.03)
      }
    })
  }
}

test('two loud masters at full faders stay below 0 dBTP on 4 of 5 pairs', async ({
  page,
}, info) => {
  const r = await page.evaluate(async () => {
    const out = []
    for (const pair of [0, 1, 2, 3, 4]) {
      out.push(await window.harness.dsp.headroom(pair, { drive: 1.5, mix: 'full' }))
    }
    return out
  })
  record(info, r)
  expect(r.filter((p) => p.masterTruePeakDbfs <= 0).length).toBeGreaterThanOrEqual(4)
})

test('the long blend stays below 0 dBTP with very loud masters', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const out = []
    for (const pair of [0, 1, 2, 3, 4]) {
      out.push(await window.harness.dsp.headroom(pair, { drive: 3, mix: 'longBlend' }))
    }
    return out
  })
  record(info, r)
  for (const p of r) expect(p.masterTruePeakDbfs).toBeLessThanOrEqual(0)
})

test('very loud masters at full faders (recorded, no criterion)', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const out = []
    for (const pair of [0, 1, 2, 3, 4]) {
      out.push(await window.harness.dsp.headroom(pair, { drive: 3, mix: 'full' }))
    }
    return out
  })
  record(info, r)
  expect(r).toHaveLength(5)
})

test('the whole proof-of-concept plan renders far faster than real time', async ({
  page,
}, info) => {
  const r = await page.evaluate(() => window.harness.dsp.renderCost())
  record(info, r)
  expect(r.realtimeFactor).toBeGreaterThanOrEqual(5)
})
