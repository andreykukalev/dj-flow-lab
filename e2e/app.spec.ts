import { expect, test } from '@playwright/test'

test('starts on Your music with an empty collection for two DJs', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'DJ Flow Lab' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your music' })).toBeVisible()
  await expect(page.getByRole('region', { name: "DJ 1's tracks" })).toContainText('No tracks yet')
  await expect(page.getByRole('region', { name: "DJ 2's tracks" })).toContainText('No tracks yet')
  await expect(page.getByRole('button', { name: 'Explore my tracks' })).toBeDisabled()
})
