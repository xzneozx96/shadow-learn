import { expect, test } from '@playwright/test'
import { seedSettings } from './support/idb-helpers'

test('debug sidebar html', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('shadowlearn_trial', 'trial')
  })
  await page.goto('/')
  await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })
  await seedSettings(page, { translationLanguage: 'en', uiLanguage: 'en' })
  await page.goto('/')
  await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })

  // Open sidebar
  await page.locator('button[data-slot="button"][aria-label="Ask AI"]').click()
  const sidebar = page.locator('[data-panel="global-sidebar"]')
  await expect(sidebar).toBeVisible({ timeout: 5_000 })

  // Send a message
  await sidebar.locator('textarea').fill('Hi')
  await sidebar.getByRole('button', { name: /send message/i }).click()

  // Wait for response
  await page.waitForTimeout(15000)
})
