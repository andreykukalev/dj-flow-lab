import { expect, test } from '@playwright/test'
import { addCollection } from './helpers'

// The set planner for one DJ: keys typed from DJ software, the Smooth Flow order, how
// each transition fits with a technique to try, and the way to that technique's lesson.

test('the set says how each transition fits and opens the technique to try', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await addCollection(page)
  const keys: Record<string, string> = {
    'deep-122.wav': '8A',
    'peak-124.wav': '9A',
    'deep-123.wav': 'Am',
    'tool-126.wav': '5A',
  }
  for (const [name, k] of Object.entries(keys)) {
    const row = page.getByTestId('collection-track').filter({ hasText: name })
    await row.getByLabel('Key').fill(k)
    await row.getByLabel('Key').press('Enter')
  }
  await page.getByRole('button', { name: 'Explore my tracks' }).click()
  const flow = page.getByRole('listitem', { name: 'Smooth Flow' })
  await expect(flow).toContainText('pairs with keys are in compatible keys')
  await flow.getByRole('button', { name: 'Explore the concept' }).click()

  const fits = page.getByTestId('fit')
  await expect(fits).toHaveCount(3)
  await expect(page.getByTestId('fit-summary')).toContainText('Transitions:')
  // The tool track in 5A clashes with 8A and 9A wherever it lands.
  await expect(fits.filter({ hasText: '5A' }).first()).toContainText('Tricky')
  await expect(fits.first()).toContainText('BPM')

  // Order by fit keeps the opener and keeps four tracks.
  const cards = page.getByTestId('set-track')
  const first = await cards.first().locator('strong').first().textContent()
  await page.getByRole('button', { name: 'Order by fit' }).click()
  await expect(cards.first().locator('strong').first()).toHaveText(first!)
  await expect(cards).toHaveCount(4)

  // The technique to try opens in Mixing techniques.
  const tech = (await fits.first().locator('.set-fit-try').textContent())!.replace('Try: ', '')
  await fits.first().getByRole('button', { name: 'How it’s done' }).click()
  await expect(page.getByRole('heading', { level: 2, name: tech })).toBeVisible()
})
