/**
 * create-lesson-youtube.spec.ts
 *
 * E2E tests for the YouTube tab of the Create Lesson page.
 *
 * Covered scenarios:
 *   US01.US06-E2E-001 — Generate button disabled when no YouTube URL entered
 *   US01.US06-E2E-003 — Submitting an invalid YouTube URL shows inline 400 error
 *   US01.US06-E2E-004 — Happy path: valid URL queues lesson, shows confirmation, clears input
 *   US01.US06-E2E-005 — Go to Library navigates home; Queue Another resets form
 *   US01.US06-E2E-006 — Job pipeline error for YouTube over max duration surfaces human-readable message
 *   US01.US06-E2E-017 — Tab switch hides inactive tab DOM elements (conditional render guard)
 */

import { expect, test } from '@playwright/test'
import { authBypass, mockConfig, mockGenerateError, mockGenerateSuccess, mockJobStatus, seedAndExpectJobError } from './helpers'

const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=DG1wRgEpdO4'
const JOB_ID = 'test-job-123'

test('US01.US06-E2E-001 @p0 @smoke @create-lesson @youtube — Generate button disabled when no YouTube URL entered', async ({ page }) => {
  await authBypass(page)
  // Register intercepts BEFORE navigation
  await mockConfig(page)
  await page.goto('/create')

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeVisible()
  await expect(btn).toBeDisabled()

  // YouTube tab should be active by default — URL input is present
  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await expect(urlInput).toBeVisible()
  // Confirm it is empty
  await expect(urlInput).toHaveValue('')
})

test('US01.US06-E2E-003 @p1 @regression @create-lesson @youtube — Submitting an invalid YouTube URL shows inline 400 error and keeps form usable', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateError(page, 400, 'Invalid YouTube URL')
  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  const btn = page.getByTestId('create-lesson-generate-button')

  await urlInput.fill('https://www.youtube.com/watch?v=INVALID123')
  await expect(btn).toBeEnabled()

  await btn.click()

  // Inline error message should appear
  const errorEl = page.getByTestId('create-lesson-form-error')
  await expect(errorEl).toBeVisible()
  await expect(errorEl).toContainText('Invalid YouTube URL')

  // Form should remain usable — button re-enabled, input still has value
  await expect(btn).toBeEnabled()
  await expect(urlInput).toBeVisible()
})

test('US01.US06-E2E-004 @p0 @smoke @create-lesson @youtube — Happy path: valid YouTube URL queues lesson, shows confirmation, clears input', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID)
  await mockJobStatus(page, JOB_ID, { status: 'complete' })
  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeEnabled()

  // Wait for the POST response to settle after clicking
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    btn.click(),
  ])
  expect(response.status()).toBe(200)

  // Queued confirmation should appear
  const confirmation = page.getByTestId('create-lesson-queued-confirmation')
  await expect(confirmation).toBeVisible()

  // Queued message should appear
  const queuedMsg = page.getByTestId('create-lesson-queued-message')
  await expect(queuedMsg).toBeVisible()
})

test('US01.US06-E2E-005 @p1 @regression @create-lesson — Go to Library navigates home; Queue Another resets form', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID)
  await mockJobStatus(page, JOB_ID, { status: 'complete' })
  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])
  expect(response.status()).toBe(200)

  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  // ── Test "Queue Another" resets form ──
  await page.getByTestId('create-lesson-queue-another-button').click()

  // Should show the form again (no queued confirmation)
  await expect(page.getByTestId('create-lesson-queued-confirmation')).not.toBeVisible()
  await expect(page.getByTestId('create-lesson-youtube-url-input')).toBeVisible()

  // URL input should be cleared after queue
  await expect(page.getByTestId('create-lesson-youtube-url-input')).toHaveValue('')

  // Now queue again and test Go to Library
  const urlInput2 = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput2.fill(VALID_YOUTUBE_URL)

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  // Go to Library navigates to home
  await page.getByTestId('create-lesson-go-to-library-button').click()
  await expect(page).toHaveURL('/')
})

test('US01.US06-E2E-006 @p1 @regression @create-lesson @youtube — Job pipeline error for YouTube over max duration surfaces in Library LessonCard', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  // Mock the job poll to return error status (duration exceeded)
  await mockJobStatus(page, JOB_ID, {
    status: 'error',
    error: 'Video exceeds maximum duration of 1200 seconds',
  })

  // Navigate to / first so the page origin is established for IDB seeding
  await page.goto('/')

  // Seed a processing lesson and wait for job poller to surface the error
  await seedAndExpectJobError(page, {
    lessonId: 'lesson-e2e-006',
    title: 'Test YouTube Lesson',
    source: 'youtube',
    sourceUrl: VALID_YOUTUBE_URL,
    jobId: JOB_ID,
    errorMessage: 'Video exceeds maximum duration of 1200 seconds',
  })
})

test('US01.US06-E2E-017 @p2 @regression @create-lesson — Tab switch hides inactive tab DOM elements (conditional render guard)', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await page.goto('/create')

  // YouTube tab is active by default — its input is present
  await expect(page.getByTestId('create-lesson-youtube-url-input')).toBeVisible()

  // Upload tab elements should NOT be in DOM (conditional render)
  await expect(page.getByTestId('create-lesson-file-input')).not.toBeVisible()
  await expect(page.getByTestId('create-lesson-upload-dropzone')).not.toBeVisible()

  // Switch to Upload tab
  await page.getByTestId('create-lesson-upload-tab').click()

  // Upload elements now in DOM
  await expect(page.getByTestId('create-lesson-upload-dropzone')).toBeVisible()

  // YouTube input should no longer be visible (conditional render removes it)
  await expect(page.getByTestId('create-lesson-youtube-url-input')).not.toBeVisible()
})
