import { expect, test } from '@playwright/test'

// The language: a switch in the header changes every screen, the document language
// follows it, and the choice survives a reload.

test('the language switch covers the screen and survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your music' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'RU', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ваша музыка' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  const steps = page.getByRole('navigation', { name: 'Шаги' })
  await expect(steps.getByRole('button')).toHaveText([
    /Ваша музыка/,
    /Концепции/,
    /Сет/,
    /Лаборатория/,
    /К выступлению/,
  ])
  await expect(page.getByRole('button', { name: 'Исследовать треки' })).toBeDisabled()

  await page.reload()
  await expect(page.locator('.set-app[data-ready="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ваша музыка' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your music' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
