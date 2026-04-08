/**
 * create-lesson-languages.spec.ts
 *
 * E2E tests for language selection on the Create Lesson page.
 *
 * Covered scenarios:
 *   US01.US06-E2E-009 — Translation language defaults to saved IDB value on page open
 *   US01.US06-E2E-010 — Source language defaults to zh-CN when no prior selection exists
 *   US01.US06-E2E-011 — Language selections are included in the generate request payload
 */

import { expect, test } from '@playwright/test'
import { seedSettings } from '../support/idb-helpers'
import { authBypass, mockConfig, mockGenerateSuccess, mockJobStatus } from './helpers'

const JOB_ID_IDB = 'test-job-idb-lang-001'

const JOB_ID = 'test-job-lang-001'
const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=DG1wRgEpdO4'

test('US01.US06-E2E-009 @p1 @regression @create-lesson — Translation language defaults to saved IDB value on page open', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)

  // Seed settings with a non-default translation language before navigating
  // Must navigate to app origin first so IDB is accessible
  await page.goto('/')
  await seedSettings(page, { translationLanguage: 'vi' })

  await page.goto('/create')

  // The translation language select trigger should display Vietnamese
  const translationSelect = page.getByTestId('create-lesson-translation-language-select')
  await expect(translationSelect).toBeVisible()
  // Trigger button text should reflect the saved language
  await expect(translationSelect).toContainText(/Vietnamese|Tiếng Việt|vi/i)
})

test('US01.US06-E2E-010 @p1 @regression @create-lesson — Source language defaults to zh-CN when no prior selection exists', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)

  // Navigate without seeding any settings — app should use default zh-CN
  await page.goto('/create')

  const sourceSelect = page.getByTestId('create-lesson-source-language-select')
  await expect(sourceSelect).toBeVisible()
  // Default source language is zh-CN, displayed as 中文
  await expect(sourceSelect).toContainText(/中文|zh-CN|Chinese/i)
})

test('US01.US06-E2E-011 @p1 @regression @create-lesson — Language selections are included in the generate request payload', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID)
  await mockJobStatus(page, JOB_ID, { status: 'complete' })

  await page.goto('/create')

  // Change translation language to Japanese by opening the select and choosing it
  const translationSelectTrigger = page.getByTestId('create-lesson-translation-language-select')
  await translationSelectTrigger.click()
  // Click the Japanese option in the dropdown
  await page.getByRole('option', { name: /Japanese|日本語/i }).click()

  // Change source language to Japanese as well (ja) by opening source select
  // Keep source as zh-CN (default) to verify both fields are sent
  // Just confirm the translation change is picked up

  // Fill YouTube URL and submit
  const urlInput = page.getByTestId('create-lesson-youtube-url-input')
  await urlInput.fill(VALID_YOUTUBE_URL)

  // Capture the outgoing POST body to verify language params
  const [request] = await Promise.all([
    page.waitForRequest(req => req.url().includes('/api/lessons/generate') && req.method() === 'POST'),
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])

  const body = JSON.parse(request.postData() ?? '{}')
  // translation_languages should include 'ja' (Japanese)
  expect(body.translation_languages).toContain('ja')
  // source_language should be present (defaults to zh-CN)
  expect(body.source_language).toBeTruthy()
  expect(body).toHaveProperty('source_language')

  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()
})

test('US01.US06-E2E-022 @p1 @regression @create-lesson — ac-03.4: IDB LessonMeta stores selected sourceLanguage and translationLanguages', async ({ page }) => {
  await authBypass(page)
  await mockConfig(page)
  await mockGenerateSuccess(page, JOB_ID_IDB)
  await mockJobStatus(page, JOB_ID_IDB, { status: 'processing' })

  await page.goto('/create')

  // Change source language to Japanese (ja)
  const sourceSelectTrigger = page.getByTestId('create-lesson-source-language-select')
  await sourceSelectTrigger.click()
  await page.getByRole('option', { name: /Japanese|日本語/i }).click()

  // Change translation language to Vietnamese (vi)
  const translationSelectTrigger = page.getByTestId('create-lesson-translation-language-select')
  await translationSelectTrigger.click()
  await page.getByRole('option', { name: /Vietnamese|Tiếng Việt/i }).click()

  // Submit with a valid YouTube URL
  await page.getByTestId('create-lesson-youtube-url-input').fill('https://www.youtube.com/watch?v=DG1wRgEpdO4')

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200),
    page.getByTestId('create-lesson-generate-button').click(),
  ])

  await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible()

  // Read the lesson record written to IndexedDB and verify language fields
  const lesson = await page.evaluate(async (jobId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('shadowlearn', 7)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result as IDBDatabase)
    })
    const all = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('lessons', 'readonly')
      const req = tx.objectStore('lessons').getAll()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result as any[])
    })
    db.close()
    return all.find(l => l.jobId === jobId) ?? null
  }, JOB_ID_IDB)

  expect(lesson).not.toBeNull()
  expect(lesson.sourceLanguage).toBe('ja')
  expect(lesson.translationLanguages).toEqual(['vi'])
})
