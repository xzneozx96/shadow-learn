/**
 * create-lesson-upload.spec.ts
 *
 * E2E tests for the Upload tab of the Create Lesson page.
 *
 * Covered scenarios:
 *   US01.US06-E2E-012 — Upload tab: Generate button disabled when no file selected
 *   US01.US06-E2E-013 — Happy path: valid file upload queues lesson with multipart
 *   US01.US06-E2E-014 — Upload with unsupported file extension: async job-poll error surfaces inline
 *   US01.US06-E2E-015 — Upload file exceeding 2 GB: async job-poll error surfaces
 *   US01.US06-E2E-016 — Upload valid file exceeding max duration: job-poll error with duration message
 */

import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { authBypass, mockConfig, mockGenerateSuccess, mockJobStatus, seedAndExpectJobError } from './helpers'

const JOB_ID = 'test-job-123'

/** Navigate to Upload tab — must be called after page.goto('/create') */
async function switchToUploadTab(page: import('@playwright/test').Page) {
  await page.getByTestId('create-lesson-upload-tab').click()
  await expect(page.getByTestId('create-lesson-upload-dropzone')).toBeVisible()
}

/** Attach a fake file to the hidden file input. */
async function attachFile(
  page: import('@playwright/test').Page,
  name = 'test-video.mp4',
  mimeType = 'video/mp4',
  content = 'fake video content',
) {
  await page.setInputFiles('[data-testid="create-lesson-file-input"]', {
    name,
    mimeType,
    buffer: Buffer.from(content),
  })
}

test('US01.US06-E2E-012 @p1 @smoke @create-lesson @upload — Upload tab: Generate button disabled when no file selected', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await page.goto('/create')
  await switchToUploadTab(page)

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeVisible()
  // No file selected — button must be disabled
  await expect(btn).toBeDisabled()
})

test('US01.US06-E2E-013 @p0 @smoke @create-lesson @upload — Happy path: valid file upload queues lesson with multipart to /api/lessons/generate-upload', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID)
  await mockJobStatus(page, JOB_ID, { status: 'complete' })
  await page.goto('/create')
  await switchToUploadTab(page)

  await attachFile(page, 'lecture.mp4', 'video/mp4')

  const btn = page.getByTestId('create-lesson-generate-button')
  await expect(btn).toBeEnabled()

  // Capture the request to verify multipart form data target
  const [request, response] = await Promise.all([
    page.waitForRequest(req => req.url().includes('/api/lessons/generate-upload')),
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate-upload') && resp.status() === 200),
    btn.click(),
  ])

  expect(request.method()).toBe('POST')
  expect(response.status()).toBe(200)

  // Queued confirmation appears
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()
  await expect(page.getByTestId('create-lesson-queued-message')).toBeVisible()
})

test('US01.US06-E2E-014 @p1 @regression @create-lesson @upload — Upload with unsupported file extension: async job-poll error surfaces in Library LessonCard', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  // Mock the job poll to return an unsupported-format error
  await mockJobStatus(page, JOB_ID, {
    status: 'error',
    error: 'Unsupported file format. Allowed formats: mp4, mkv, webm, mov, wav, mp3, m4a, aac, flac, ogg, opus',
  })

  // Navigate to / first to establish the page origin for IDB seeding
  await page.goto('/')

  // Seed a processing upload lesson and wait for job poller to surface the error
  await seedAndExpectJobError(page, {
    lessonId: 'lesson-e2e-014',
    title: 'document.txt',
    source: 'upload',
    sourceUrl: null,
    jobId: JOB_ID,
    errorMessage: 'Unsupported file format. Allowed formats: mp4, mkv, webm, mov, wav, mp3, m4a, aac, flac, ogg, opus',
  })
})

test('US01.US06-E2E-015 @p1 @regression @create-lesson @upload — Upload file exceeding 2 GB: async job-poll error surfaces in Library LessonCard', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  // Mock the job poll to return a file-size-exceeded error
  await mockJobStatus(page, JOB_ID, {
    status: 'error',
    error: 'File size exceeds the maximum allowed size of 2 GB (2147483648 bytes)',
  })

  // Navigate to / first to establish the page origin for IDB seeding
  await page.goto('/')

  // Seed a processing upload lesson and wait for job poller to surface the error
  await seedAndExpectJobError(page, {
    lessonId: 'lesson-e2e-015',
    title: 'huge-video.mp4',
    source: 'upload',
    sourceUrl: null,
    jobId: JOB_ID,
    errorMessage: 'File size exceeds the maximum allowed size of 2 GB (2147483648 bytes)',
  })
})

test('US01.US06-E2E-016 @p1 @regression @create-lesson @upload — Upload valid file exceeding max duration: job-poll error surfaces in Library LessonCard', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  // Mock the job poll to return a duration-exceeded error
  await mockJobStatus(page, JOB_ID, {
    status: 'error',
    error: 'Video exceeds maximum duration of 1200 seconds',
  })

  // Navigate to / first to establish the page origin for IDB seeding
  await page.goto('/')

  // Seed a processing upload lesson and wait for job poller to surface the error
  await seedAndExpectJobError(page, {
    lessonId: 'lesson-e2e-016',
    title: 'long-lecture.mp4',
    source: 'upload',
    sourceUrl: null,
    jobId: JOB_ID,
    errorMessage: 'Video exceeds maximum duration of 1200 seconds',
  })
})
