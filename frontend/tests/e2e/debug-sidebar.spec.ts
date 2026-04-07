import { expect, test } from '@playwright/test'
import { seedSettings } from './support/idb-helpers'

// Manual debug test — skipped in CI. Run locally with: pnpm test:e2e tests/e2e/debug-sidebar.spec.ts
// Requires a live backend (OpenRouter key in IDB) to get an AI response.
test.skip(!!process.env.CI, 'Manual debug test — skipped in CI')

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

  // Send a message and wait for a response element to appear instead of a fixed timeout
  await sidebar.locator('textarea').fill('Hi')
  await sidebar.getByRole('button', { name: /send message/i }).click()

  // Wait for the AI response to stream in (any assistant message content appearing)
  await expect(sidebar.locator('[data-role="assistant"]').first()).toBeVisible({ timeout: 30_000 })
})
