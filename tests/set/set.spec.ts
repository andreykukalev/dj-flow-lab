import { expect, test, type Page } from '@playwright/test'

// #87 slice 1 end to end: two DJs add their tracks, the app estimates their tempo and
// shape, says what it noticed, offers readings, and a reading's order becomes the set,
// whose transitions open with the two real tracks in the Transition Builder.

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

async function addCollection(page: Page) {
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

test('two DJs explore their tracks and open a transition in the Lab', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your music' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore my tracks' })).toBeDisabled()
  await addCollection(page)

  // Each track is listed with its owner, a likely tempo and its length.
  const andrei = page.getByRole('region', { name: "Andrei's tracks" })
  const first = andrei.getByTestId('collection-track').first()
  await expect(first).toContainText('deep-122.wav')
  await expect(first).toContainText('2:06')
  expect(Number(await first.getByLabel('BPM').inputValue())).toBeCloseTo(122, 1)
  await expect(first.locator('.set-layer')).toHaveText('likely')
  await expect(page.getByRole('note').first()).toContainText(
    'Not measured yet: vocals, melody and key',
  )

  // The DJ's own tempo replaces the estimate.
  const tool = page
    .getByRole('region', { name: "Lena's tracks" })
    .getByTestId('collection-track')
    .last()
  await tool.getByLabel('BPM').fill('126')
  await tool.getByLabel('BPM').press('Enter')
  await expect(tool.locator('.set-layer')).toHaveText('your choice')
  await tool.getByLabel('Key').fill('8A')
  await tool.getByLabel('Key').press('Enter')

  await page.getByRole('button', { name: 'Explore my tracks' }).click()
  await expect(
    page.getByRole('heading', { name: 'What we noticed in your 4 tracks' }),
  ).toBeVisible()
  const observations = page.getByTestId('observation')
  expect(await observations.count()).toBeGreaterThanOrEqual(3)
  await expect(
    page.getByTestId('observation').filter({ hasText: 'within a small tempo change' }),
  ).toBeVisible()
  const hear = observations.first().getByRole('button').first()
  await hear.click()
  await expect(hear).toHaveAttribute('aria-pressed', 'true')
  await hear.click()
  await expect(hear).toHaveAttribute('aria-pressed', 'false')

  const climb = page.getByRole('listitem', { name: 'A Steady Climb' })
  await expect(climb).toContainText('Uses 2 of Andrei’s and 2 of Lena’s tracks')
  await expect(page.getByRole('listitem', { name: 'Two Rooms, One Night' })).toBeVisible()
  await climb.getByRole('button', { name: 'Explore the concept' }).click()

  // The set: four tracks, three transitions, none tried.
  await expect(page.getByRole('heading', { name: 'A Steady Climb' })).toBeVisible()
  await expect(page.getByTestId('set-track')).toHaveCount(4)
  const transitions = page.getByTestId('transition')
  await expect(transitions).toHaveCount(3)
  await expect(transitions.first()).toHaveAttribute('data-status', 'not tried')
  await expect(page.getByTestId('set-track').last()).toContainText('key 8A')

  // Open the first transition in the Transition Builder and play it.
  const names = await page.getByTestId('set-track').locator('strong').allTextContents()
  await transitions.first().getByRole('button', { name: 'Open in the Lab' }).click()
  await expect(page.locator('.poc-title')).toContainText(`${names[0]} → ${names[1]}`, {
    timeout: 30_000,
  })
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await page.getByRole('button', { name: '← Back to the set' }).click()

  // Tried stays with the pair when the track moves.
  await expect(transitions.first()).toHaveAttribute('data-status', 'tried')
  await page.getByRole('button', { name: `Move ${names[2]} earlier` }).click()
  await expect(transitions.nth(0)).toHaveAttribute('data-status', 'not tried')
  await page.getByRole('button', { name: `Move ${names[1]} earlier` }).click()
  await expect(page.getByTestId('set-track').locator('strong')).toHaveText([
    names[0]!,
    names[1]!,
    names[2]!,
    names[3]!,
  ])
  await expect(transitions.first()).toHaveAttribute('data-status', 'tried')
})
