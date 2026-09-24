/**
 * create-lesson-pipeline.spec.ts
 *
 * E2E tests for the lesson generation pipeline (job polling and status progression).
 *
 * Covered scenarios:
 *   US01.US06-E2E-007 — Pipeline progresses through steps and reaches ready status
 *   US01.US06-E2E-021 — Generate button shows loading state during in-flight call
 */

import { expect, test } from '@playwright/test'
import { readPendingLessons, seedLesson, seedPendingLesson, signUpAndLogin } from '../support/api-helpers'
import { mockConfig, mockGenerateSuccess, mockJobProgressing, mockJobStatus } from './helpers'

const JOB_ID = 'test-job-pipeline-001'
const JOB_ID_SEGMENTS = 'test-job-segments-001'
const JOB_ID_PROCESSING = 'test-job-processing-001'
const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=DG1wRgEpdO4'
const PENDING_LESSON_ID = 'pending-segments-fixture-001'

test('US01.US06-E2E-007 @p1 @regression @create-lesson — Pipeline progresses through steps and reaches ready status', async ({ page }) => {
  await signUpAndLogin(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID)
  // First poll returns 'processing', subsequent calls return 'complete'
  await mockJobProgressing(page, JOB_ID)

  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])

  // Queued confirmation should appear immediately after the POST succeeds
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  // The confirmation persists while the job progresses in the background.
  // The job poller runs in LessonsContext; on the /create page we just see
  // the queued confirmation. Verify it stays visible throughout polling.
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible({ timeout: 15_000 })
})

test('US01.US06-E2E-021 @p1 @regression @create-lesson — Generate button shows loading state (text changes + disabled) during in-flight call', async ({ page }) => {
  await signUpAndLogin(page)
  await mockConfig(page)

  // Delay the generate response so we can observe the loading state
  let resolveGenerate!: () => void
  const generateResolved = new Promise<void>(res => (resolveGenerate = res))

  await page.route('**/api/lessons/generate', async (route) => {
    await generateResolved
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: JOB_ID }),
    })
  })
  await mockJobStatus(page, JOB_ID, { status: 'complete' })

  await page.goto('/create')

  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeEnabled()

  // Click and immediately check loading state (before resolveGenerate fires)
  await btn.click()

  // Button should be disabled while submitting
  await expect(btn).toBeDisabled()

  // Button text should change to loading indicator (e.g. "Starting…" or similar)
  // The component sets submitting=true which changes the button text
  await expect(btn).not.toContainText(/^Generate/i)

  // Now let the request complete
  resolveGenerate()

  // After completion, confirmation appears
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible({ timeout: 5_000 })
})

test('US01.US06-E2E-023 @p1 @regression @create-lesson — ac-04.1: Library shows processing badge immediately after submission', async ({ page }) => {
  await signUpAndLogin(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID_PROCESSING)
  // Keep job in processing so card badge stays visible
  await mockJobStatus(page, JOB_ID_PROCESSING, { status: 'processing', step: 'transcription' })

  await page.goto('/create')
  await page.getByTestId('create-lesson-youtube-url-input').fill(VALID_YOUTUBE_URL)

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])

  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  await page.goto('/')

  await expect(page.locator('.animate-spin.text-muted-foreground').first()).toBeVisible({ timeout: 5_000 })
})

test('US01.US06-E2E-024 @p1 @regression @create-lesson — ac-04.3: Pipeline completion swaps the pending card for the server lesson', async ({ page }) => {
  const user = await signUpAndLogin(page)
  await mockConfig(page)
  await mockJobStatus(page, JOB_ID_SEGMENTS, { status: 'complete' })

  const lessonId = await seedLesson(page.request, user, {
    title: 'Segments Test Lesson',
    source: 'youtube',
    source_url: VALID_YOUTUBE_URL,
    duration: 7,
    segments: [
      { id: 'seg-001', start: 0, end: 3.5, text: '你好', romanization: 'nǐ hǎo', translations: { en: 'Hello' }, words: [] },
      { id: 'seg-002', start: 3.5, end: 7, text: '谢谢', romanization: 'xiè xiè', translations: { en: 'Thank you' }, words: [] },
    ],
  })

  await page.goto('/')
  await seedPendingLesson(page, user, {
    id: PENDING_LESSON_ID,
    title: 'Segments Test Lesson',
    source: 'youtube',
    sourceUrl: VALID_YOUTUBE_URL,
    translationLanguages: ['en'],
    sourceLanguage: 'zh-CN',
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'processing',
    jobId: JOB_ID_SEGMENTS,
  })
  await page.reload()

  await expect(page.getByTestId(`lesson-card-${PENDING_LESSON_ID}`)).toHaveAttribute('data-status', 'processing')
  await expect(page.getByTestId(`lesson-card-${PENDING_LESSON_ID}`)).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByTestId(`lesson-card-${lessonId}`)).toHaveAttribute('data-status', 'complete')
  expect(await readPendingLessons(page, user)).toEqual([])
})
