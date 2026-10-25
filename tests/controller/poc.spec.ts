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
