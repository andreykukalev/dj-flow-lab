import { expect, type Page } from '@playwright/test'

// Generated tracks and a shared collection for the set planning browser tests (#87).

const SR = 16000

type Part = { bars: number; kick: boolean; bass: boolean; hats: boolean }
const full = { kick: true, bass: true, hats: true }
const sparse = { kick: true, bass: false, hats: false }
const empty = { kick: false, bass: false, hats: false }

/** A mono 16-bit WAV of a synthetic arrangement: kick, off-beat bass and hats, part by part. */
function songWav(bpm: number, parts: Part[]): Buffer {
  const beat = 60 / bpm
  const bars = parts.reduce((n, p) => n + p.bars, 0)
  const n = Math.ceil((bars * 4 * beat + 0.5) * SR)
  const data = Buffer.alloc(44 + 2 * n)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + 2 * n, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(SR, 24)
  data.writeUInt32LE(2 * SR, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(2 * n, 40)
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  let bar0 = 0
  for (const part of parts) {
    const start = Math.round(bar0 * 4 * beat * SR)
    const end = Math.round((bar0 + part.bars) * 4 * beat * SR)
    for (let i = start; i < end && i < n; i++) {
      const t = i / SR
      const inBeat = t % beat
      let v = 0.05 * Math.sin(2 * Math.PI * 330 * t)
      if (part.kick) v += 0.5 * Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-inBeat / 0.15)
      const off = (t + beat / 2) % beat
      if (part.bass) v += 0.3 * Math.sin(2 * Math.PI * 45 * off) * Math.exp(-off / 0.2)
      if (part.hats) v += 0.1 * rnd() * Math.exp(-(t % (beat / 2)) / 0.02)
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + 2 * i)
    }
    bar0 += part.bars
  }
  return data
}

const DEEP: Part[] = [
  { bars: 16, ...sparse },
  { bars: 32, ...full },
  { bars: 16, ...sparse },
]
const PEAK: Part[] = [
  { bars: 8, ...sparse },
  { bars: 16, ...full },
  { bars: 8, ...empty },
  { bars: 16, ...full },
  { bars: 8, ...sparse },
]
const TOOL: Part[] = [{ bars: 32, ...full }]

const wav = (name: string, bpm: number, parts: Part[]) => ({
  name,
  mimeType: 'audio/wav',
  buffer: songWav(bpm, parts),
})

export async function addCollection(page: Page) {
  await page.getByLabel('DJ 1 name').fill('Andrei')
  await page.getByLabel('DJ 1 name').press('Enter')
  await page.getByLabel('DJ 2 name').fill('Lena')
  await page.getByLabel('DJ 2 name').press('Enter')
  await page
    .getByTestId('add-dj1')
    .setInputFiles([wav('deep-122.wav', 122, DEEP), wav('peak-124.wav', 124, PEAK)])
  await page
    .getByTestId('add-dj2')
    .setInputFiles([wav('deep-123.wav', 123, DEEP), wav('tool-126.wav', 126, TOOL)])
  await expect(page.locator('[data-testid="collection-track"][data-status="ready"]')).toHaveCount(
    4,
    { timeout: 60_000 },
  )
}
