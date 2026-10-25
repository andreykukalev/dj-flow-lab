import { expect, test } from '@playwright/test'
import type {} from '../../src/poc/window'

// #46: the proof-of-concept page with the user's own tracks: loading a file, grid
// corrections while playing, and refused points.

test.beforeEach(async ({ page }) => {
  await page.goto('/poc/')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
})

/** A mono 16-bit WAV with a click on every beat. */
function clickWav(seconds: number, bpm: number, firstBeatSec: number, sampleRate = 22050): Buffer {
  const n = Math.round(seconds * sampleRate)
  const data = Buffer.alloc(44 + 2 * n)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + 2 * n, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(sampleRate, 24)
  data.writeUInt32LE(2 * sampleRate, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(2 * n, 40)
  const beat = 60 / bpm
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate - firstBeatSec
    const inBeat = t >= 0 ? t % beat : 1
    const v = inBeat < 0.01 ? 0.5 * Math.sin(2 * Math.PI * 1000 * inBeat) : 0
    data.writeInt16LE(Math.round(v * 32767), 44 + 2 * i)
  }
  return data
}

test('loads a local file onto a deck and corrects its grid', async ({ page }) => {
  await page.getByTestId('file-B').setInputFiles({
    name: 'clicks-120.wav',
    mimeType: 'audio/wav',
    buffer: clickWav(90, 120, 0.5),
  })
  const deckB = page.locator('[data-track="B"]')
  await expect(deckB).toContainText('clicks-120.wav')
  await expect(deckB).toContainText('90.0 s')

  await deckB.getByLabel('BPM').fill('120')
  await deckB.getByLabel('BPM').press('Enter')
  await deckB.getByLabel('The 1 at').fill('0.5')
  await deckB.getByLabel('The 1 at').press('Enter')
  const grid = await page.evaluate(() => window.poc!.decks.B.grid)
  expect(grid).toMatchObject({ bpm: 120, anchorSec: 0.5, source: 'user' })
  expect(await page.evaluate(() => window.poc!.plan.decks.B.grid.bpm)).toBe(120)

  await deckB.getByRole('button', { name: '+1 ms' }).click()
  expect(await page.evaluate(() => window.poc!.decks.B.grid.anchorSec)).toBeCloseTo(0.501, 9)
})

test('sets the tempo from two downbeats', async ({ page }) => {
  const deckA = page.locator('[data-track="A"]')
  // Demo A: 124 BPM, the 1 at 0.1 s; bar 1 and bar 33 are 32 bars apart.
  const bar33 = 0.1 + (32 * 4 * 60) / 124
  await deckA.getByLabel('Deck A first downbeat').fill('0.1')
  await deckA.getByLabel('Deck A second downbeat').fill(String(bar33 + 0.031))
  await deckA.getByRole('button', { name: 'Set BPM from two points' }).click()
  const bpm = await page.evaluate(() => window.poc!.decks.A.grid.bpm)
  expect(bpm).toBeCloseTo((60 * 128) / (bar33 + 0.031 - 0.1), 6)
})

test('a grid change while playing keeps playing from the same beat', async ({ page }) => {
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await page.waitForTimeout(500)
  const before = await page.evaluate(() => window.poc!.transport.beatAt())
  await page.locator('[data-track="A"]').getByRole('button', { name: '+0.01' }).click()
  const after = await page.evaluate(() => {
    const s = window.poc!.transport.state
    return { kind: s.kind, beat: s.kind === 'playing' ? s.anchor.beat : Number.NaN }
  })
  expect(after.kind).toBe('playing')
  expect(after.beat - before).toBeGreaterThanOrEqual(0)
  expect(after.beat - before).toBeLessThan(0.5)
})

test('refuses points outside the tracks and keeps the plan', async ({ page }) => {
  const field = page.getByLabel('with B from bar')
  await field.fill('999')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toContainText('after the end of track B')
  expect(await page.evaluate(() => window.poc!.points.entryBarB)).toBe(1)
  expect(await page.evaluate(() => window.poc!.plan.points.entryBarB)).toBe(1)
})

// #68: grabbing a control while it plays records a take; Original and Your take can
// be compared, and Undo, Redo and Reset change nothing that cannot be brought back.

const trimShown = (page: import('@playwright/test').Page) =>
  page
    .locator('[data-control="A.trim"]')
    .evaluate((el) => Number((el as HTMLElement).dataset.value))

test('a take on a knob plays back, and undo, redo and reset bring everything back', async ({
  page,
}) => {
  const knob = page.getByRole('img', { name: 'Deck A trim' })
  const summary = page.getByTestId('takes-summary')

  // Grabbing while nothing plays only explains what to do.
  await knob.hover()
  await page.mouse.down()
  await page.mouse.up()
  await expect(summary).toContainText('Press play')
  expect(await page.evaluate(() => window.poc!.history.takes.length)).toBe(0)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await page.waitForTimeout(300)
  const box = (await knob.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await expect(page.locator('[data-control="A.trim"]')).toHaveAttribute('data-held', 'true')
  // 40 px up turns the trim a quarter of its range: from 0 to +0.5.
  await page.mouse.move(x, y - 40, { steps: 8 })
  await page.waitForTimeout(400)
  await page.mouse.up()

  const take = await page.evaluate(() => {
    const p = window.poc!
    return {
      takes: p.history.takes.map((t) => ({ control: t.control, last: t.points.at(-1)!.value })),
      userEvents: p.plan.events.filter((e) => e.source === 'user').length,
      listening: p.listening,
    }
  })
  expect(take.takes).toEqual([{ control: 'A.trim', last: expect.closeTo(0.5, 2) }])
  expect(take.userEvents).toBeGreaterThan(0)
  expect(take.listening).toBe('take')
  await expect(summary).toContainText('1 move on A trim')

  // Replayed from just before the grab, the audio follows the take.
  const replayed = await page.evaluate(async () => {
    const p = window.poc!
    const points = p.history.takes[0]!.points
    p.transport.startAt(points[0]!.beat - 0.5)
    const end = points.at(-1)!.beat + 0.5
    while (p.transport.beatAt() < end) await new Promise((r) => setTimeout(r, 50))
    return p.mixer.targetsOf('A.trim')[0]!.param.value
  })
  expect(replayed).toBeCloseTo(10 ** (6 / 20), 1) // +0.5 → +6 dB

  // After the release the trim holds the user's value.
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('paused')
  await expect.poll(() => trimShown(page)).toBeCloseTo(0.5, 2)

  // Original is the app's plan, untouched; Your take comes back unchanged.
  await page.getByRole('button', { name: 'Original' }).click()
  await expect.poll(() => trimShown(page)).toBe(0)
  expect(await page.evaluate(() => window.poc!.plan.events.some((e) => e.source === 'user'))).toBe(
    false,
  )
  await page.getByRole('button', { name: 'Your take' }).click()
  await expect.poll(() => trimShown(page)).toBeCloseTo(0.5, 2)

  // Reset can be undone; keys undo and redo too.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => trimShown(page)).toBe(0)
  expect(await page.evaluate(() => window.poc!.history.takes.length)).toBe(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await page.evaluate(() => window.poc!.history.takes.length)).toBe(1)
  await expect.poll(() => trimShown(page)).toBeCloseTo(0.5, 2)
  await page.locator('body').press('ControlOrMeta+z')
  expect(await page.evaluate(() => window.poc!.history.takes.length)).toBe(0)
  await page.locator('body').press('ControlOrMeta+Shift+z')
  expect(await page.evaluate(() => window.poc!.history.takes.length)).toBe(1)
})
