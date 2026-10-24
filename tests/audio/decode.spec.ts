import { expect, test } from '@playwright/test'
import type {} from '../../harness/main'
import type { DecodeRow } from '../../harness/decode'

// S2 (#43): which files each engine decodes, natively or through the AIFF fallback,
// and whether decoders agree on timing. Results are recorded in TECHNICAL_SPIKES.md.

let rows: DecodeRow[]

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/harness/')
  await expect(page.locator('body[data-ready="true"]')).toBeAttached()
  rows = await page.evaluate(() => window.harness.decode.decodeMatrix())
  await page.close()
})

const row = (file: string) => rows.find((r) => r.file === file)!
const LSB16 = 2 ** -15

test('records the decoding matrix', () => {
  const info = test.info()
  for (const r of rows)
    info.annotations.push({ type: 'measurement', description: JSON.stringify(r) })
  expect(rows).toHaveLength(18)
})

test('decodes the common formats natively', () => {
  for (const file of [
    'wav_s16.wav',
    'wav_s24.wav',
    'wav_f32.wav',
    'flac.flac',
    'mp3_lame.mp3',
    'mp3_lame_noheader.mp3',
    'mp3_shine.mp3',
    'aac.m4a',
    'vorbis.ogg',
    'opus.opus',
  ]) {
    expect(row(file).native, file).toBe('ok')
    expect(row(file).channelOrderOk, file).toBe(true)
  }
})

test('decodes every uncompressed AIFF and AIFF-C, natively or through the fallback', () => {
  for (const r of rows.filter((r) => /\.aif[fc]$/.test(r.file))) {
    expect(r.decodedBy, r.file).toBeDefined()
    expect(r.frames, r.file).toBe(22050)
    if (r.channels === 2) expect(r.channelOrderOk, r.file).toBe(true)
    if (r.maxDiffFromReference !== undefined) {
      expect(r.maxDiffFromReference, r.file).toBeLessThanOrEqual(LSB16)
    }
  }
  expect(row('aiff_s16_mono.aiff').channels).toBe(1)
})

test('FLAC matches the 24-bit WAV sample for sample', () => {
  expect(row('flac.flac').maxDiffFromReference).toBe(0)
})

test('puts the first onset where the WAV has it, or the shift shows in the frame count', () => {
  const ref = row('wav_s16.wav').onsetsMs![0]!
  for (const r of rows) {
    if (!r.onsetsMs) continue
    const shift = Math.abs(r.onsetsMs[0]! - ref)
    if (shift > 1) {
      // D-24: a decoder offset must be detectable by its decoded length.
      expect(r.frames, `${r.file} is shifted by ${shift.toFixed(2)} ms`).not.toBe(22050)
    }
  }
  // MP3 with the LAME gapless header is trimmed exactly.
  expect(Math.abs(row('mp3_lame.mp3').onsetsMs![0]! - ref)).toBeLessThanOrEqual(0.05)
  expect(row('mp3_lame.mp3').frames).toBe(22050)
})
