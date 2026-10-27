import { expect, test } from '@playwright/test'
import { addCollection } from './helpers'

// #87 slice 1 end to end: two DJs add their tracks, the app estimates their tempo and
// shape, says what it noticed, offers readings, and a reading's order becomes the set,
// whose transitions open with the two real tracks in the Transition Builder.

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

  // Check a reading by ear: a claim that does not sound right takes its readings away.
  const unknown = page.getByRole('listitem', { name: 'Into the Unknown' })
  const claims = unknown.getByTestId('claim')
  await expect(claims).toHaveCount(2)
  await claims
    .filter({ hasText: 'steady grooves' })
    .getByRole('button', { name: 'Doesn’t sound like that' })
    .click()
  await expect(page.getByRole('listitem', { name: 'Into the Unknown' })).toHaveCount(0)
  await expect(page.getByTestId('observation').filter({ hasText: 'steady grooves' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show them again' }).click()
  await expect(page.getByRole('listitem', { name: 'Into the Unknown' })).toBeVisible()

  const climb = page.getByRole('listitem', { name: 'A Steady Climb' })
  const idea = climb.getByRole('button', { name: /Hear the idea/ })
  await idea.click()
  await expect(climb.getByRole('button', { name: /Stop the idea \(1 of 4\)/ })).toBeVisible()
  await climb.getByRole('button', { name: /Stop the idea/ }).click()
  await expect(idea).toHaveAttribute('aria-pressed', 'false')
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

  // The arc: the reading's, until the DJs move it; a track set against it gets a note.
  const arc = page.getByRole('figure')
  await expect(arc.locator('.set-layer')).toHaveText('interpretation')
  await expect(page.getByTestId('arc-note')).toHaveCount(0)
  await page.getByLabel('Arc at slot 1').fill('1')
  await page.getByLabel('Arc at slot 4').fill('0')
  await expect(arc.locator('.set-layer')).toHaveText('your choice')
  await expect(page.getByTestId('set-track').first().getByTestId('arc-note')).toContainText(
    'below the arc',
  )

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
