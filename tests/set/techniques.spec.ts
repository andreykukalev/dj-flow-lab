import { expect, test } from '@playwright/test'

// Mixing techniques, the second part of the app: a technique plays on the lesson tracks,
// the version without it plays from the same bar, another technique on another pair of
// tracks loads, and what the DJ marked as practised survives a reload.

test('a technique plays, compares with its version without, and is marked practised', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mixing techniques' }).click()
  const section = page.getByTestId('techniques')
  await expect(section.getByRole('heading', { name: 'Enter on the phrase' })).toBeVisible()
  await expect(page.getByTestId('tech-step')).toHaveCount(3)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')

  // Without the technique: same moment, no steps, still playing.
  await page.getByTestId('tech-without').click()
  await expect(page.getByTestId('tech-step')).toHaveCount(0)
  await expect(section.getByText('B starts two bars after A’s phrase line')).toBeVisible()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')

  // A technique with a loop, on the awkward pair.
  await section.getByRole('button', { name: 'Loop the intro of B' }).click()
  await expect(section.getByRole('heading', { name: 'Loop the intro of B' })).toBeVisible()
  await expect(page.getByTestId('timeline-loop')).toBeVisible()
  await expect(section.getByText('Short Fuse')).toBeVisible()

  await page.getByTestId('tech-done').check()
  await expect(page.getByTestId('tech-progress')).toHaveText('1 of 11 practised')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Loop the intro of B' })).toBeVisible()
  await expect(page.getByTestId('tech-progress')).toHaveText('1 of 11 practised')

  // Back to planning a set.
  await page.getByRole('button', { name: 'Plan a set' }).click()
  await expect(page.getByRole('heading', { name: 'Your music' })).toBeVisible()
})
