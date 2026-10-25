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
  const field = page.getByLabel('lined up with B at')
  await field.fill('999')
  await field.press('Enter')
  await expect(page.getByRole('alert')).toContainText('after the end of track B')
  expect(await page.evaluate(() => window.poc!.points.entryBarB)).toBe(17)
  expect(await page.evaluate(() => window.poc!.plan.points.entryBarB)).toBe(17)
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

// The mixing line shows every control the plan moves, not just the faders: each EQ band
// and the filter get a lane drawn from the compiled plan, with the value each move
// reaches; with a take, the lanes it changed are marked and the other version is dashed.

test('the mixing line shows EQ and filter moves and what a take changed', async ({ page }) => {
  const lane = (key: string) => page.locator(`[data-lane="${key}"]`)

  for (const key of [
    'A.eqHigh',
    'A.eqMid',
    'A.eqLow',
    'A.filter',
    'B.eqHigh',
    'B.eqMid',
    'B.eqLow',
  ])
    await expect(lane(key)).toHaveAttribute('data-changed', 'true')
  await expect(lane('B.filter')).toHaveAttribute('data-changed', 'false')
  await expect(lane('B.filter')).toContainText('no change')
  await expect(lane('A.trim')).toHaveCount(0)

  await expect(lane('A.eqLow')).toContainText('▼ kill')
  await expect(lane('A.eqLow')).toHaveAttribute('title', /down to kill at A bar 25/)
  await expect(lane('A.filter')).toContainText('▲ HP 60 Hz')
  await expect(lane('B.eqHigh')).toContainText('−12 dB')
  await expect(lane('B.eqHigh')).toContainText('▲ 0 dB')
  await expect(lane('A.fader')).toContainText('▼ off')

  // The readouts follow the beat on screen.
  await page.evaluate(() => window.poc!.transport.cue(36))
  await expect(lane('A.eqLow').locator('.timeline-readout')).toHaveText('kill')
  await expect(lane('A.filter').locator('.timeline-readout')).toHaveText('HP 60 Hz')
  await expect(lane('B.eqLow').locator('.timeline-readout')).toHaveText('0 dB')

  await page.evaluate(() =>
    window.poc!.addTake({
      id: 'lp',
      control: 'B.filter',
      points: [
        { beat: 16, value: 0 },
        { beat: 36, value: -0.6 },
        { beat: 56, value: 0 },
      ],
    }),
  )
  await expect(lane('B.filter')).toHaveAttribute('data-changed', 'true')
  await expect(lane('B.filter')).toHaveAttribute('data-differs', 'true')
  await expect(lane('B.filter')).toContainText('▼ LP')
  await expect(lane('B.filter')).toContainText('▲ off')
  await expect(lane('B.filter').locator('.timeline-ghost')).toHaveCount(1)
  await expect(lane('A.eqLow')).toHaveAttribute('data-differs', 'false')
  await expect(page.getByTestId('timeline').locator('..')).toContainText(
    'Solid: Your take · dashed: Original',
  )

  // Listening to the original shows the original, with the take dashed.
  await page.getByRole('button', { name: 'Original' }).click()
  await expect(lane('B.filter')).toHaveAttribute('data-changed', 'false')
  await expect(lane('B.filter')).toHaveAttribute('data-differs', 'true')
  await expect(page.getByTestId('timeline').locator('..')).toContainText(
    'Solid: Original · dashed: Your take',
  )
})

// #29: the whole-track view finds where the music changes and proposes likely sections.

/** A mono 16-bit WAV of an arrangement at 120 BPM: parts with or without kick, bass and hats. */
function arrangementWav(
  parts: { bars: number; kick: boolean; bass: boolean; hats: boolean }[],
  sampleRate = 11025,
): Buffer {
  const beat = 0.5
  const bars = parts.reduce((n, p) => n + p.bars, 0)
  const n = Math.ceil((bars * 4 * beat + 0.5) * sampleRate)
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
  let seed = 7
  let bar0 = 0
  for (const part of parts) {
    const start = Math.round(bar0 * 4 * beat * sampleRate)
    const end = Math.min(n, Math.round((bar0 + part.bars) * 4 * beat * sampleRate))
    for (let i = start; i < end; i++) {
      const t = i / sampleRate
      const inBeat = t % beat
      let v = 0.05 * Math.sin(2 * Math.PI * 330 * t)
      if (part.kick) v += 0.5 * Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-inBeat / 0.15)
      const off = (t + beat / 2) % beat
      if (part.bass) v += 0.3 * Math.sin(2 * Math.PI * 45 * off) * Math.exp(-off / 0.2)
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      if (part.hats) v += 0.1 * (seed / 2147483648) * Math.exp(-(t % (beat / 2)) / 0.02)
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + 2 * i)
    }
    bar0 += part.bars
  }
  return data
}

test('shows the whole track with changes, phrase check and likely sections', async ({ page }) => {
  const full = { kick: true, bass: true, hats: true }
  const none = { kick: false, bass: false, hats: false }
  await page.getByTestId('file-A').setInputFiles({
    name: 'arranged-120.wav',
    mimeType: 'audio/wav',
    buffer: arrangementWav([
      { bars: 16, kick: true, bass: false, hats: false },
      { bars: 16, ...full },
      { bars: 16, ...none },
      { bars: 16, ...full },
      { bars: 8, kick: true, bass: false, hats: false },
    ]),
  })
  const deckA = page.locator('[data-track="A"]')
  await expect(deckA).toContainText('arranged-120.wav')
  await deckA.getByLabel('BPM').fill('120')
  await deckA.getByLabel('BPM').press('Enter')

  const sections = page.getByRole('list', { name: 'Deck A likely sections' })
  await expect(sections.getByRole('listitem')).toHaveText([
    /^INTRO 1–16/,
    /^GROOVE 17–32/,
    /^BREAKDOWN 33–48/,
    /^DROP 49–56/,
    /^GROOVE 57–64/,
    /^OUTRO 65–72/,
  ])
  const check = page.getByTestId('phrase-check-A')
  await expect(check).toHaveText('4 of 4 changes fall on a phrase line.')

  // Moved off the music, the phrase lines get a suggestion that puts them back.
  await page.getByRole('button', { name: 'Deck A phrase lines one bar later' }).click()
  await expect(check).toContainText('0 of 4 changes fall on a phrase line.')
  await expect(check).toContainText(
    'Most fall 1 bar before the lines: the phrases may start at bar 1',
  )
  await page.getByRole('button', { name: 'Start phrases at bar 1' }).click()
  await expect(check).toHaveText('4 of 4 changes fall on a phrase line.')
  expect(await page.evaluate(() => window.poc!.decks.A.grid.phraseOffsetBars)).toBe(0)
})

// #75: one blend start and one transition area, set from the cursor, the whole-track
// timeline, phrase lines and sections, or typed exactly; the plan blends that area.

const poc = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const p = window.poc!
    const t = p.transport.state
    return {
      points: p.points,
      area: p.area,
      before: p.fitted.beforeBeats,
      after: p.fitted.afterBeats,
      blendStart: p.blendStartBeat,
      cursor: t.kind === 'paused' ? t.beat : t.kind === 'playing' ? p.transport.beatAt() : null,
      span: p.plan.span,
    }
  })

/** Client x of a track beat of a deck on its whole-track view. */
async function xOfBeat(
  page: import('@playwright/test').Page,
  testId: string,
  trackBeat: number,
  deck: 'A' | 'B' = 'A',
) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded()
  const box = (await page.getByTestId(testId).boundingBox())!
  const bars = await page.evaluate((d) => window.poc!.structure(d).bars.length, deck)
  return { x: box.x + (trackBeat / (bars * 4)) * box.width, y: box.y + box.height / 2 }
}

test('the blend start comes from the cursor, and the cursor keeps its place', async ({ page }) => {
  // Demo: A's bar 25 lined up with B's bar 17, ±16 bars.
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 25, entryBarB: 17 },
    before: 64,
    after: 64,
    blendStart: 96,
  })
  await expect(page.getByTestId('blend-summary')).toContainText(
    'From A 9.1 to A 41.1, A blends with B from 1.1 to 33.1',
  )

  // A click on track A moves only the cursor, to the beat under it.
  const at = await xOfBeat(page, 'overview-track-A', 4 * 12 + 2) // A 13.3
  await page.mouse.click(at.x, at.y + 30)
  await expect.poll(async () => (await poc(page)).cursor).toBe(50 - 96)
  expect((await poc(page)).blendStart).toBe(96)
  await expect(page.getByTestId('mark-A')).toHaveAttribute('title', 'Blend start: A 25.1')

  // The cursor becomes the blend start; the cursor stays on A 13.3, now beat 0.
  await page.getByRole('button', { name: 'Blend start at cursor' }).click()
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 13, exitBeatA: 3, entryBarB: 17 },
    blendStart: 50,
    cursor: 0,
  })
  await expect(page.getByLabel('Blend start at A')).toHaveValue('13.3')
  await expect(page.getByTestId('blend-lane')).toContainText('Blend start 13.3')

  // So does the B key, after a jump of one bar.
  await page.locator('body').press('ArrowRight')
  await page.locator('body').press('KeyB')
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 14, exitBeatA: 3 },
    blendStart: 54,
    cursor: 0,
  })
})

test('the blend lane sets the blend start and sizes the area', async ({ page }) => {
  // A click in the lane puts the blend start there, on the nearest beat.
  const lane = 'blend-lane'
  let at = await xOfBeat(page, lane, 4 * 28 + 1) // A 29.2
  await page.mouse.click(at.x, at.y)
  expect(await poc(page)).toMatchObject({ points: { exitBarA: 29, exitBeatA: 2 }, blendStart: 113 })
  await expect(page.getByLabel('Blend start at A')).toHaveValue('29.2')

  // Dragging the flag moves it; the area and the plan move with it.
  const flag = page.getByTestId('blend-lane').locator('.ov-flag')
  const box = (await flag.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  at = await xOfBeat(page, lane, 4 * 24) // A 25.1
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await page.mouse.up()
  expect(await poc(page)).toMatchObject({ points: { exitBarA: 25 }, blendStart: 96 })

  // Dragging an edge of a linked area resizes both sides.
  const edge = page.getByTestId('blend-lane').locator('.ov-handle[data-edge="after"]')
  const e = (await edge.boundingBox())!
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2)
  await page.mouse.down()
  at = await xOfBeat(page, lane, 96 + 32) // 8 bars after the blend start
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await page.mouse.up()
  expect(await poc(page)).toMatchObject({
    area: { beforeBars: 8, afterBars: 8, linked: true },
    before: 32,
    after: 32,
  })
  await expect(page.getByLabel('±')).toHaveValue('8')

  // Unlinked, one edge moves on its own.
  await page.getByLabel('Same before and after').uncheck()
  const b = (await page
    .getByTestId('blend-lane')
    .locator('.ov-handle[data-edge="before"]')
    .boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  at = await xOfBeat(page, lane, 96 - 16) // 4 bars before
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await page.mouse.up()
  expect(await poc(page)).toMatchObject({
    area: { beforeBars: 4, afterBars: 8, linked: false },
    before: 16,
    after: 32,
  })
  await expect(page.getByLabel('before', { exact: true })).toHaveValue('4')
  await expect(page.getByLabel('after', { exact: true })).toHaveValue('8')
})

test('typed values set any position and the plan blends exactly the area', async ({ page }) => {
  await page.getByLabel('Blend start at A').fill('30.3')
  await page.getByLabel('Blend start at A').press('Enter')
  await page.getByLabel('±').fill('4')
  await page.getByLabel('±').press('Enter')
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 30, exitBeatA: 3 },
    before: 16,
    after: 16,
    span: { startBeat: -48, endBeat: 48 },
  })
  await expect(page.getByTestId('blend-summary')).toContainText(
    'From A 26.3 to A 34.3, A blends with B from 13.1 to 21.1',
  )

  // B is silent before the area and full by its middle; A is gone at its end.
  const levels = await page.evaluate(() => {
    const p = window.poc!
    return [-16.5, -16, -8, 0, 8, 16].map((b) => ({
      A: p.transport.stateAt(b)['A.fader'],
      B: p.transport.stateAt(b)['B.fader'],
    }))
  })
  expect(levels.map((l) => l.B)).toEqual([0, 0, 1, 1, 1, 1])
  expect(levels.map((l) => l.A)).toEqual([1, 1, 1, 1, 1, 0])
  const events = await page.evaluate(() => window.poc!.plan.events)
  for (const e of events) {
    expect(e.atBeat).toBeGreaterThanOrEqual(-16)
    expect(e.untilBeat ?? e.atBeat).toBeLessThanOrEqual(16)
  }

  // An area near the start of B is trimmed, and says so.
  await page.getByLabel('lined up with B at').fill('3')
  await page.getByLabel('lined up with B at').press('Enter')
  expect(await poc(page)).toMatchObject({ before: 8, after: 16 })
  await expect(page.getByTestId('blend-summary')).toContainText(
    'Before trimmed to 2 bars: B has no music before that.',
  )
})

test('a phrase line or a section is a starting point for the blend', async ({ page }) => {
  await page.getByRole('button', { name: 'Blend start on the phrase line at bar 17' }).click()
  expect(await poc(page)).toMatchObject({ points: { exitBarA: 17 }, blendStart: 64 })
  await expect(page.getByLabel('Blend start at A')).toHaveValue('17.1')

  // From there the blend start can move off the phrase line.
  await page.getByLabel('Blend start at A').fill('18.2')
  await page.getByLabel('Blend start at A').press('Enter')
  expect(await poc(page)).toMatchObject({ points: { exitBarA: 18, exitBeatA: 2 } })

  const full = { kick: true, bass: true, hats: true }
  await page.getByTestId('file-A').setInputFiles({
    name: 'arranged-120.wav',
    mimeType: 'audio/wav',
    buffer: arrangementWav([
      { bars: 16, kick: true, bass: false, hats: false },
      { bars: 16, ...full },
      { bars: 16, kick: false, bass: false, hats: false },
      { bars: 16, ...full },
      { bars: 8, kick: true, bass: false, hats: false },
    ]),
  })
  const deckA = page.locator('[data-track="A"]')
  await deckA.getByLabel('BPM').fill('120')
  await deckA.getByLabel('BPM').press('Enter')
  await page.getByRole('button', { name: 'Blend across BREAKDOWN 33–48' }).click()
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 41 },
    area: { beforeBars: 8, afterBars: 8, linked: true },
    before: 32,
    after: 32,
  })
})

test('track B has its own blend lane for the beat lined up with the blend start', async ({
  page,
}) => {
  const lane = 'blend-lane-B'
  await expect(page.getByTestId(lane)).toContainText('B at blend start 17.1')

  // A click in B's lane chooses the beat of B at the blend start; A's side stays.
  let at = await xOfBeat(page, lane, 4 * 12 + 2, 'B') // B 13.3
  await page.mouse.click(at.x, at.y)
  expect(await poc(page)).toMatchObject({
    points: { exitBarA: 25, entryBarB: 13, entryBeatB: 3 },
    blendStart: 96,
    before: 50,
    after: 64,
  })
  await expect(page.getByLabel('lined up with B at')).toHaveValue('13.3')
  await expect(page.getByTestId(lane)).toContainText('B at blend start 13.3')
  await expect(page.getByTestId('blend-summary')).toContainText(
    'Before trimmed to 12 bars 2 beats: B has no music before that.',
  )

  // Dragging the flag moves it, and B's edges size the same area.
  const flag = page.getByTestId(lane).locator('.ov-flag')
  const box = (await flag.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  at = await xOfBeat(page, lane, 4 * 8, 'B') // B 9.1
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await page.mouse.up()
  expect((await poc(page)).points).toEqual({ exitBarA: 25, entryBarB: 9 })
  const edge = page.getByTestId(lane).locator('.ov-handle[data-edge="before"]')
  const e = (await edge.boundingBox())!
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2)
  await page.mouse.down()
  at = await xOfBeat(page, lane, 4 * 4, 'B') // 4 bars before B 9.1
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await page.mouse.up()
  expect(await poc(page)).toMatchObject({
    area: { beforeBars: 4, afterBars: 4, linked: true },
    before: 16,
    after: 16,
  })

  // B's phrase lines line up with the blend start, and a click on track B moves the cursor.
  await page
    .getByRole('button', { name: "Line up B's phrase line at bar 17 with the blend start" })
    .click()
  expect((await poc(page)).points).toEqual({ exitBarA: 25, entryBarB: 17 })
  at = await xOfBeat(page, 'overview-track-B', 4 * 20, 'B') // B 21.1
  await page.mouse.click(at.x, at.y + 30)
  await expect.poll(async () => (await poc(page)).cursor).toBe(16)

  // Typed exactly, on any beat.
  await page.getByLabel('lined up with B at').fill('5.2')
  await page.getByLabel('lined up with B at').press('Enter')
  expect((await poc(page)).points).toEqual({ exitBarA: 25, entryBarB: 5, entryBeatB: 2 })
})
