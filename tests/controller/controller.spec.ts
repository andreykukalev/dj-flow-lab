import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type {} from '../../src/poc/window'

// S5 (#45): the virtual controller on the proof-of-concept page, on a running
// AudioContext. P7 (rendered values = stateAt(beat(heardTime)) on every frame) and P8
// (suspend and hidden tab) from docs/TECHNICAL_SPIKES.md. Results are recorded in the
// "S5 result" section there.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await page.goto('/poc/?log=2000')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
})

const isFirefox = (info: TestInfo) => info.project.name === 'firefox'

function record(info: TestInfo, result: unknown) {
  info.annotations.push({ type: 'measurement', description: JSON.stringify(result) })
}

/** Starts playback from the page's Play button (a user gesture), then seeks to `beat`. */
async function playFrom(page: Page, beat: number) {
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await page.evaluate((b) => window.poc!.transport.startAt(b), beat)
}

/**
 * Checks the logged frames from `fromFrameMs` on: what the mixer's DOM showed against
 * `stateAt` at the beat recomputed from each frame's heard time and transport state,
 * and the frame-to-frame motion of the beat against the frame clock.
 */
function checkFrames(page: Page, fromFrameMs = 0) {
  return page.evaluate((from) => {
    const { loop, transport, compiled } = window.poc!
    const frames = loop.log.filter((f) => f.frameMs >= from)
    let mismatches = 0
    let maxDiff = 0
    const jitterMs: number[] = []
    const jumps: { jitterMs: number; frameMs: number; currentTimeMs: number }[] = []
    const sources = new Set<string>()
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!
      sources.add(f.heard.source)
      const t = f.transport
      const beat =
        t.kind === 'playing'
          ? Math.max(
              t.anchor.beat,
              t.anchor.beat + (f.heard.time - t.anchor.ctxTime) / (60 / t.anchor.bpm),
            )
          : t.kind === 'paused'
            ? t.beat
            : compiled.span.startBeat
      const expected = transport.stateAt(beat)
      let frameOk = Math.abs(beat - f.beat) < 1e-9
      for (const [key, value] of Object.entries(expected)) {
        const diff = Math.abs(f.rendered[key as keyof typeof expected] - value)
        maxDiff = Math.max(maxDiff, diff)
        // Same arithmetic as the app, so only rounding in the last bits may differ.
        if (diff > 1e-12) frameOk = false
      }
      if (!frameOk) mismatches++
      const prev = frames[i - 1]
      if (
        prev &&
        t.kind === 'playing' &&
        prev.transport === t &&
        prev.beat > t.anchor.beat &&
        f.beat > t.anchor.beat
      ) {
        const beatMs = ((f.beat - prev.beat) * 60_000) / t.anchor.bpm
        const jitter = Math.abs(beatMs - (f.frameMs - prev.frameMs))
        jitterMs.push(jitter)
        if (jitter > 16.7) {
          jumps.push({
            jitterMs: jitter,
            frameMs: f.frameMs - prev.frameMs,
            currentTimeMs: (f.currentTime - prev.currentTime) * 1000,
          })
        }
      }
    }
    const intervals = frames.slice(1).map((f, i) => f.frameMs - frames[i]!.frameMs)
    const sorted = [...intervals].sort((a, b) => a - b)
    return {
      frames: frames.length,
      mismatches,
      maxDiff,
      maxJitterMs: Math.max(0, ...jitterMs),
      jumps,
      medianFrameMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      sources: [...sources],
    }
  }, fromFrameMs)
}

test('P7: the mixer shows stateAt(beat(heardTime)) on every frame', async ({ page }, info) => {
  await playFrom(page, -8) // the bass swap, on the blend start at beat 0, falls in the log
  await page.waitForTimeout(5000)
  const clock = await page.evaluate(() => {
    const ctx = window.poc!.ctx
    const ts = ctx.getOutputTimestamp()
    return {
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency,
      outputLatency: ctx.outputLatency,
      timestampLagMs: ((ctx.currentTime - (ts.contextTime ?? 0)) * 1000).toFixed(1),
      heard: window.poc!.loop.log.at(-1)?.heard,
    }
  })
  const r = await checkFrames(page)
  record(info, { ...r, clock })
  expect(r.frames).toBeGreaterThan(100)
  expect(r.mismatches).toBe(0)
  expect(r.sources).toEqual([isFirefox(info) ? 'outputTimestamp+latency' : 'outputTimestamp'])
  // Frame-to-frame jitter of the heard beat stays within one frame. The controller
  // follows the audio clock, so a jump is allowed only where the audio clock itself
  // jumped or stalled.
  const clockJumps = r.jumps.filter((j) => Math.abs(j.currentTimeMs - j.frameMs) > r.medianFrameMs)
  expect(r.jumps).toEqual(clockJumps)
  expect(r.jumps.length).toBeLessThanOrEqual(2)
  // The mixer really moved: A's low band is killed after the swap.
  expect(await page.locator('[data-control="A.eqLow"]').getAttribute('data-value')).toBe('0')
})

test('P8: a suspended context pauses the transport at the right beat', async ({ page }, info) => {
  await playFrom(page, -4)
  await page.waitForTimeout(1500)
  const suspended = await page.evaluate(async () => {
    const { ctx, transport } = window.poc!
    const playing = transport.state
    await ctx.suspend()
    await new Promise((r) => setTimeout(r, 300))
    const state = transport.state
    const expected =
      playing.kind === 'playing'
        ? playing.anchor.beat +
          (ctx.currentTime - playing.anchor.ctxTime) / (60 / playing.anchor.bpm)
        : Number.NaN
    return { kind: state.kind, beat: state.kind === 'paused' ? state.beat : Number.NaN, expected }
  })
  expect(suspended.kind).toBe('paused')
  expect(Math.abs(suspended.beat - suspended.expected)).toBeLessThan(1e-9)
  await expect(page.getByTestId('transport-state')).toHaveText('paused')

  const paused = await page.evaluate(() => {
    const last = window.poc!.loop.log.at(-1)!
    return { beat: last.beat, frameMs: last.frameMs }
  })
  expect(paused.beat).toBe(suspended.beat)

  // Resuming from the Play button continues from the paused beat, mixer and audio agreeing.
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await page.waitForTimeout(1500)
  const r = await checkFrames(page, paused.frameMs)
  const resumed = await page.evaluate(() => {
    const t = window.poc!.transport.state
    return t.kind === 'playing' ? t.anchor.beat : Number.NaN
  })
  record(info, { suspended, resumedAt: resumed, ...r })
  expect(resumed).toBe(suspended.beat)
  expect(r.mismatches).toBe(0)
})

test('P8: after frames stop (hidden tab), the next frame matches the sound', async ({
  page,
}, info) => {
  await playFrom(page, -24)
  await page.waitForTimeout(1000)
  // A hidden tab gets no animation frames while the audio plays on. Stop the loop for
  // 3 s to get the same gap here; the 30 s check with a real hidden tab is manual.
  const before = await page.evaluate(() => {
    window.poc!.loop.stop()
    return window.poc!.loop.log.at(-1)!.beat
  })
  await page.waitForTimeout(3000)
  const restartedAt = await page.evaluate(() => {
    window.poc!.loop.start()
    return performance.now()
  })
  await page.waitForTimeout(500)
  const r = await checkFrames(page, restartedAt)
  const first = await page.evaluate(
    (from) => window.poc!.loop.log.find((f) => f.frameMs >= from)!.beat,
    restartedAt,
  )
  const beatsPerSec = 124 / 60
  record(info, { before, first, ...r })
  expect(r.mismatches).toBe(0)
  // The first frame after the gap is already 3 s further on, not where it stopped.
  expect(first - before).toBeGreaterThan(2.9 * beatsPerSec)
  expect(first - before).toBeLessThan(3.5 * beatsPerSec)
})

test('the mixer marks a control about to move', async ({ page }) => {
  await page.evaluate(() => window.poc!.transport.cue(-6))
  const low = page.locator('[data-control="A.eqLow"]')
  await expect(low).toHaveAttribute('data-upcoming', 'true')
  await expect(low.locator('[data-part="caption"]')).toHaveText('kill at 25')
  await expect(page.locator('[data-control="B.eqLow"] [data-part="caption"]')).toHaveText(
    'full at 25',
  )
  await expect(page.locator('[data-control="A.trim"]')).toHaveAttribute('data-upcoming', 'false')
})
