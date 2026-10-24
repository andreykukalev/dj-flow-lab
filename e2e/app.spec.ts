import { expect, test } from '@playwright/test'

test('shows the Transition Builder with two empty decks', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'DJ Flow Lab' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Deck A' })).toContainText('No track loaded')
  await expect(page.getByRole('article', { name: 'Deck B' })).toContainText('No track loaded')
})
