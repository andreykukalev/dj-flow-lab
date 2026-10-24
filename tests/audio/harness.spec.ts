import { expect, test } from '@playwright/test'
import type {} from '../../harness/main'

// Integration tests for the browser audio test harness (#41, spike S8).
// They check that offline rendering and the measurement helpers behave the same
// in every browser engine, so later engine tests can rely on them.

test.beforeEach(async ({ page }) => {
  await page.goto('/harness/')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
})

test('offline gain ramp follows the scheduled envelope', async ({ page }) => {
  const envelope = await page.evaluate(async () => {
    const h = window.harness
    const sampleRate = 48000
    const [out] = await h.renderOffline({ sampleRate, seconds: 1 }, (ctx) => {
      const src = new AudioBufferSourceNode(ctx, {
        buffer: h.toBuffer([h.signals.sine(sampleRate, 1, 1000)], sampleRate),
      })
      const gain = new GainNode(ctx, { gain: 0 })
      gain.gain.setValueAtTime(0, 0)
      gain.gain.linearRampToValueAtTime(1, 1)
      src.connect(gain).connect(ctx.destination)
      src.start(0)
    })
    // 20 windows of 50 ms; a sine of amplitude g has RMS g/√2.
    return h.measure.rmsEnvelope(out!, sampleRate / 20).map((r) => r * Math.SQRT2)
  })
  expect(envelope).toHaveLength(20)
  envelope.forEach((g, i) => {
    const expected = (i + 0.5) / 20 // ramp value at the window centre
    expect(Math.abs(g - expected)).toBeLessThan(0.01)
  })
})

test('offline source start times are sample-accurate', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.harness
    const sampleRate = 44100
    const opts = { sampleRate, seconds: 4, bpm: 120, firstBeatSec: 0.1 }
    const clicks = h.signals.clickTrack(opts)
    const [out] = await h.renderOffline({ sampleRate, seconds: 6 }, (ctx) => {
      const src = new AudioBufferSourceNode(ctx, { buffer: h.toBuffer([clicks], sampleRate) })
      src.connect(ctx.destination)
      src.start(1) // start the whole track exactly 1 s in
    })
    const expected = h.signals.clickPositions(opts).map((p) => p + sampleRate)
    const found = h.measure.onsets(out!)
    return {
      count: found.length,
      expectedCount: expected.length,
      maxOffset: h.measure.maxOnsetOffset(found, expected),
    }
  })
  expect(result.count).toBe(result.expectedCount)
  expect(result.maxOffset).toBeLessThanOrEqual(0.5)
})

test('real-time AudioContext runs and produces sound @realtime', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ctx = new AudioContext()
    await ctx.resume()
    const osc = new OscillatorNode(ctx, { frequency: 440 })
    const analyser = new AnalyserNode(ctx, { fftSize: 2048 })
    osc.connect(analyser).connect(ctx.destination)
    osc.start()
    const t0 = ctx.currentTime
    const wall0 = performance.now()
    await new Promise((r) => setTimeout(r, 500))
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    const result = {
      state: ctx.state,
      audioElapsed: ctx.currentTime - t0,
      wallElapsed: (performance.now() - wall0) / 1000,
      peak,
    }
    await ctx.close()
    return result
  })
  expect(result.state).toBe('running')
  expect(result.audioElapsed).toBeGreaterThan(result.wallElapsed * 0.5)
  expect(result.peak).toBeGreaterThan(0.5)
})
