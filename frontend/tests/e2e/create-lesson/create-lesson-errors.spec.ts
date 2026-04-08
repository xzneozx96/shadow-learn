/**
 * create-lesson-errors.spec.ts
 *
 * E2E tests for error handling on the Create Lesson page.
 *
 * Covered scenarios:
 *   US01.US06-E2E-008 — Backend unreachable on Generate shows user-friendly error and re-enables button
 *   US01.US06-E2E-020 — Toast notification shown alongside inline error on non-2xx server response
 */

import { expect, test } from '@playwright/test'
import { authBypass, mockConfig } from './helpers'

const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=DG1wRgEpdO4'

test('US01.US06-E2E-008 @p1 @regression @create-lesson — Backend unreachable on Generate shows user-friendly error and re-enables button', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)

  // Simulate a network failure (backend unreachable) by aborting the connection
  await page.route('**/api/lessons/generate', route => route.abort('connectionrefused'))

  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeEnabled()
  await btn.click()

  // Wait for error to appear — could be inline error or toast
  // Inline error shows in data-testid="create-lesson-form-error"
  const errorEl = page.getByTestId('create-lesson-form-error')
  await expect(errorEl).toBeVisible({ timeout: 10_000 })

  // Button must be re-enabled after error (form is usable again)
  await expect(btn).toBeEnabled()

  // URL input should still be visible and accessible
  await expect(urlInput).toBeVisible()
})

test('US01.US06-E2E-020 @p1 @regression @create-lesson — Toast notification shown alongside inline error on non-2xx server response', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)

  // Return a 400 error with a detail message
  const errorDetail = 'Invalid YouTube URL provided'
  await page.route('**/api/lessons/generate', route =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: errorDetail }),
    }))

  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  await page.getByTestId('create-lesson-generate-button').click()

  // Toast notification should appear (sonner uses [data-sonner-toast])
  const toast = page.locator('[data-sonner-toast]')
  await expect(toast).toBeVisible({ timeout: 5_000 })

  // Inline error element should also be visible
  const inlineError = page.getByTestId('create-lesson-form-error')
  await expect(inlineError).toBeVisible()
  await expect(inlineError).toContainText(errorDetail)
})
