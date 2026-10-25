import { expect, test } from '@playwright/test'
import { addCollection } from './helpers'

// #87 slice 3: alternatives beside a slot, versions of a transition by each DJ, comparing
// them on one playhead, a comment on a bar, both DJs picking the same version, and the
// set sheet and rekordbox export made from it (slice 4).

test('two DJs save versions of a transition, compare them and agree', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await addCollection(page)
  await page.getByRole('button', { name: 'Explore my tracks' }).click()
  await page
    .getByRole('listitem', { name: 'A Steady Climb' })
    .getByRole('button', { name: 'Explore the concept' })
    .click()

  // An alternative beside the first slot, swapped in with one action.
  const cards = page.getByTestId('set-track')
  const names = await cards.locator('strong').allTextContents()
  await page.getByRole('button', { name: `Remove ${names[3]} from the set` }).click()
  await expect(cards).toHaveCount(3)
  await cards.first().getByLabel('Alternative for slot 1').selectOption({ label: names[3]! })
  await cards.first().getByRole('button', { name: 'Put beside it' }).click()
  await cards.first().getByRole('button', { name: 'Swap in' }).click()
  await expect(cards.first().locator('strong').first()).toHaveText(names[3]!)
  await expect(cards.first().getByTestId('alternatives')).toContainText(names[0]!)
  await cards.first().getByRole('button', { name: 'Swap in' }).click()
  await expect(cards.first().locator('strong').first()).toHaveText(names[0]!)

  // Andrei saves Auto's idea; Lena saves a shorter blend.
  await page
    .getByTestId('transition')
    .first()
    .getByRole('button', { name: 'Open in the Lab' })
    .click()
  await expect(page.locator('.poc-title')).toContainText(`${names[0]} → ${names[1]}`, {
    timeout: 30_000,
  })
  const work = page.getByRole('region', { name: 'Versions and decision' })
  await page
    .getByRole('group', { name: 'Who is at the screen' })
    .getByRole('button', { name: 'Andrei' })
    .click()
  await work.getByLabel('Version name').fill('Auto, long')
  await work.getByRole('button', { name: 'Save as a version' }).click()
  await page
    .getByRole('group', { name: 'Who is at the screen' })
    .getByRole('button', { name: 'Lena' })
    .click()
  const area = page.getByTestId('blend-controls').locator('..').getByLabel('±')
  await area.fill('4')
  await area.press('Enter')
  await work.getByRole('button', { name: 'Save as a version' }).click()
  const versions = work.getByTestId('version')
  await expect(versions).toHaveCount(2)
  await expect(versions.nth(0)).toContainText('Andrei')
  await expect(versions.nth(1)).toContainText('Lena’s version 1')
  await expect(versions.nth(1)).toContainText('4 + 4 bars')

  // Compare on one playhead: switching keeps playing.
  await page.getByTestId('play').click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  const compare = work.getByRole('group', { name: 'Compare two versions' })
  await compare.getByRole('button', { name: 'Hear 1' }).click()
  await expect(compare.getByRole('button', { name: 'Hear 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await compare.getByRole('button', { name: 'Hear 2' }).click()
  await expect(page.getByTestId('transport-state')).toHaveText('playing')
  await compare.getByLabel('Blind').check()
  await expect(compare.getByRole('button', { name: 'Reveal which is which' })).toBeVisible()
  await expect(compare).not.toContainText('Auto, long')
  await page.getByTestId('play').click()

  // A comment on a bar, then both pick the same version.
  await work.getByLabel('Comment').fill('the bass swap is too early here')
  await work.getByRole('button', { name: 'Pin to the bar at the cursor' }).click()
  await expect(work.getByTestId('comment')).toContainText('Lena')
  await expect(work.getByTestId('comment')).toContainText('bar ')

  await work.getByLabel("Lena's pick").selectOption({ label: 'Auto, long' })
  await work.getByLabel('Reason').fill('more room for the pad')
  await work.getByRole('button', { name: 'Pick' }).click()
  await expect(work.getByTestId('pick-dj2')).toContainText('Auto, long')
  await expect(work.getByRole('status')).toHaveCount(0)
  await page
    .getByRole('group', { name: 'Who is at the screen' })
    .getByRole('button', { name: 'Andrei' })
    .click()
  await work.getByLabel("Andrei's pick").selectOption({ label: 'Auto, long' })
  await work.getByRole('button', { name: 'Pick' }).click()
  await expect(work.getByRole('status')).toHaveText('Agreed by both: Auto, long')

  await page.getByRole('button', { name: '← Back to the set' }).click()
  await expect(page.getByTestId('transition').first()).toHaveAttribute(
    'data-status',
    'agreed by both',
  )

  // The sheet for the night, and the rekordbox export (#95).
  await page.getByRole('button', { name: 'Perform' }).click()
  await expect(page.getByTestId('sheet-slot')).toHaveCount(3)
  await expect(page.getByTestId('sheet-slot').first()).toContainText('Deck 1')
  await expect(page.getByTestId('sheet-slot').nth(1)).toContainText('Deck 2')
  const first = page.getByTestId('sheet-transition').first()
  await expect(first).toContainText('Auto, long by Andrei. Agreed by both.')
  await expect(first).toContainText('press PLAY on deck 2')
  await expect(first.locator('tbody tr').first()).toContainText('Channel 2 fader')
  await expect(page.getByTestId('sheet-transition').nth(1)).toContainText('No version saved yet')
  await page.getByLabel('Folder of the tracks').fill('/Users/andrei/Music/B2B')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download rekordbox XML' }).click()
  const file = await (await download).path()
  const xml = (await import('node:fs')).readFileSync(file, 'utf8')
  expect(xml).toContain('<DJ_PLAYLISTS Version="1.0.0">')
  expect(xml).toContain(`Location="file://localhost/Users/andrei/Music/B2B/${names[0]}.wav"`)
  expect(xml).toContain('Num="-1"')
})
