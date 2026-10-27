import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addCollection, collectionFiles } from './helpers'

// #96: the set is kept in this browser without its audio, comes back after a reload with
// its tracks waiting for their files, and passes to the other DJ as a file.

test('the set survives a reload and passes to the other DJ as a file', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await addCollection(page)
  await page.getByRole('button', { name: 'Explore my tracks' }).click()
  await page
    .getByRole('listitem', { name: 'A Steady Climb' })
    .getByRole('button', { name: 'Explore the concept' })
    .click()
  const names = await page.getByTestId('set-track').locator('strong').allTextContents()
  // Autosave runs a moment after the last change.
  await page.waitForTimeout(1000)

  await page.reload()
  await expect(page.locator('.set-app[data-ready="true"]')).toBeVisible()
  await expect(page.locator('[data-testid="collection-track"][data-status="missing"]')).toHaveCount(
    4,
  )
  await page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: 'The set' })
    .click()
  await expect(page.getByTestId('set-track').locator('strong')).toHaveText(names)

  // Listening needs the file again; selecting it matches it to its track.
  await page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: 'Your music' })
    .click()
  const files = collectionFiles()
  await page.getByTestId('add-dj1').setInputFiles(files.dj1)
  await page.getByTestId('add-dj2').setInputFiles(files.dj2)
  const ready = page.locator('[data-testid="collection-track"][data-status="ready"]')
  await expect(ready).toHaveCount(4, { timeout: 60_000 })
  await expect(page.getByTestId('collection-track')).toHaveCount(4)
  await expect(ready.first()).toContainText('matched by fingerprint')

  // Lena gets the set as a file and opens it in her own browser.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Set', exact: true }).click()
  await page.getByRole('button', { name: 'Pass the set (file)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.djset\.json$/)
  const text = await readFile((await file.path())!, 'utf8')

  const other = await browser.newContext()
  const lena = await other.newPage()
  await lena.goto('/')
  await expect(lena.locator('.set-app[data-ready="true"]')).toBeVisible()
  await lena.getByTestId('open-set').setInputFiles({
    name: file.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(lena.getByTestId('collection-track')).toHaveCount(4)
  await lena
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: 'The set' })
    .click()
  await expect(lena.getByTestId('set-track').locator('strong')).toHaveText(names)

  // A file that is not a set says so.
  await lena
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: 'Your music' })
    .click()
  await lena.getByTestId('open-set').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": 1}'),
  })
  await expect(lena.getByRole('alert')).toContainText('not a DJ Flow Lab set file')
  await other.close()
})
