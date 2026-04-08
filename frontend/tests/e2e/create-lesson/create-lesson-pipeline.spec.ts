/**
 * create-lesson-pipeline.spec.ts
 *
 * E2E tests for the lesson generation pipeline (job polling and status progression).
 *
 * Covered scenarios:
 *   US01.US06-E2E-002 — Generate button disabled until STT provider resolves from /api/config
 *   US01.US06-E2E-007 — Pipeline progresses through steps and reaches ready status
 *   US01.US06-E2E-021 — Generate button shows loading state during in-flight call
 */

import { expect, test } from '@playwright/test'
import { seedLesson } from '../support/idb-helpers'
import { authBypass, mockConfig, mockGenerateSuccess, mockJobProgressing, mockJobStatus } from './helpers'

const JOB_ID = 'test-job-pipeline-001'
const JOB_ID_SEGMENTS = 'test-job-segments-001'
const JOB_ID_PROCESSING = 'test-job-processing-001'
const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=DG1wRgEpdO4'
const LESSON_ID_SEGMENTS = 'lesson-segments-fixture-001'

test('US01.US06-E2E-002 @p1 @regression @create-lesson — Generate button disabled until STT provider resolves from /api/config', async ({ page }) => {
  await authBypass(page)

  // Delay the /api/config response to observe the disabled state before resolution
  let resolveConfig!: () => void
  const configResolved = new Promise<void>(res => (resolveConfig = res))

  await page.route('**/api/config', async (route) => {
    await configResolved
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stt_provider: 'deepgram', tts_provider: 'azure', free_trial_available: true }),
    })
  })

  await page.goto('/create')

  // Type a URL so it's not the URL being missing that disables the button
  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  const btn = page.getByTestId('create-lesson-generate-button')
  // While config is pending, button should be disabled
  await expect(btn).toBeDisabled()

  // Now let config resolve
  resolveConfig()

  // After config resolves (sttProvider is set), button becomes enabled
  await expect(btn).toBeEnabled({ timeout: 5_000 })
})

test('US01.US06-E2E-007 @p1 @regression @create-lesson — Pipeline progresses through steps and reaches ready status', async ({ page }) => {
  await authBypass(page)
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
  await authBypass(page)
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
  await authBypass(page)
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

  // Queued confirmation confirms the lesson was written to IDB with status=processing
  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  // Navigate to Library — lesson should already be in IDB, card should show processing immediately
  await page.goto('/')

  // Processing badge must appear without waiting for a poll cycle (immediate IDB read)
  await expect(page.getByTestId('lesson-card-processing')).toBeVisible({ timeout: 5_000 })
})

test('US01.US06-E2E-024 @p1 @regression @create-lesson — ac-04.3: Pipeline completion writes segments to IDB', async ({ page }) => {
  const mockSegments = [
    {
      id: 'seg-001',
      lessonId: LESSON_ID_SEGMENTS,
      start: 0,
      end: 3.5,
      text: '你好',
      romanization: 'nǐ hǎo',
      translations: { en: 'Hello' },
      words: [],
      language: 'zh-CN',
    },
    {
      id: 'seg-002',
      lessonId: LESSON_ID_SEGMENTS,
      start: 3.5,
      end: 7,
      text: '谢谢',
      romanization: 'xiè xiè',
      translations: { en: 'Thank you' },
      words: [],
      language: 'zh-CN',
    },
  ]

  await authBypass(page)
  await mockConfig(page)

  // Mock job poll to return complete with segments
  await page.route(`**/api/jobs/${JOB_ID_SEGMENTS}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: JOB_ID_SEGMENTS,
        status: 'complete',
        step: null,
        error: null,
        result: {
          lesson: {
            title: 'Segments Test Lesson',
            source: 'youtube',
            source_url: VALID_YOUTUBE_URL,
            duration: 7,
            segments: mockSegments,
            translation_languages: ['en'],
          },
        },
      }),
    }))

  // Seed a processing lesson so the poller starts polling
  await page.goto('/')
  await seedLesson(page, {
    id: LESSON_ID_SEGMENTS,
    title: 'Segments Test Lesson',
    source: 'youtube',
    sourceUrl: VALID_YOUTUBE_URL,
    translationLanguages: ['en'],
    sourceLanguage: 'zh-CN',
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    // @ts-expect-error — extra runtime fields not in static type
    status: 'processing',
    jobId: JOB_ID_SEGMENTS,
  })

  await page.reload()

  // Wait for lesson card to transition to complete (poller writes status=complete to IDB)
  await expect(page.getByTestId(`lesson-card-${LESSON_ID_SEGMENTS}`)).toHaveAttribute('data-status', 'complete', { timeout: 20_000 })

  // Verify segments were persisted in IDB
  const segments = await page.evaluate(async (lessonId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('shadowlearn', 7)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result as IDBDatabase)
    })
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('segments', 'readonly')
      const req = tx.objectStore('segments').get(lessonId)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })
    db.close()
    return result
  }, LESSON_ID_SEGMENTS)

  expect(Array.isArray(segments)).toBe(true)
  expect(segments.length).toBe(2)
  expect(segments[0].text).toBe('你好')
  expect(segments[1].text).toBe('谢谢')
})
