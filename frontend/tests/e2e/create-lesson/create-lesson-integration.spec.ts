/**
 * create-lesson-integration.spec.ts
 *
 * REAL INTEGRATION TESTS — no API mocking.
 *
 * These tests hit the running backend at http://localhost:8000.
 * They exercise the full lesson creation pipeline end-to-end:
 *   submit YouTube URL → backend downloads + transcribes → job completes →
 *   poller writes result to IDB → Library card transitions to complete.
 *
 * Requirements:
 *   - Backend running at http://localhost:8000 with valid API keys configured
 *   - Free Trial mode enabled (SHADOWLEARN_*_API_KEY env vars set in backend)
 *
 * Covered scenarios:
 *   INTEGRATION-001 — Full pipeline: YouTube URL → real backend → lesson complete in IDB
 */

import { expect, test } from '@playwright/test'
import { authBypass } from './helpers'

const VALID_YOUTUBE_URL = 'https://www.youtube.com/watch?v=tfzSPPU9bw4&list=PL7WO21N4FE1DeT_W7eA7CZiCVWLekKHMg'

// Real pipeline can take several minutes (download + transcribe + translate)
const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

test.describe('Real backend integration', () => {
  test.setTimeout(PIPELINE_TIMEOUT_MS + 30_000)

  test('INTEGRATION-001 @integration — Full pipeline: submit YouTube URL to real backend, lesson transitions to complete', async ({ page }) => {
    await authBypass(page)

    // Navigate to verify the backend is reachable before starting
    const configResp = await page.request.get('http://localhost:8000/api/config')
    if (!configResp.ok()) {
      test.skip(true, `Backend not reachable at http://localhost:8000 (status ${configResp.status()}) — start the backend and retry`)
    }

    const config = await configResp.json()
    if (!config.free_trial_available) {
      test.skip(true, 'free_trial_available is false — configure SHADOWLEARN_*_API_KEY env vars in backend .env')
    }

    await page.goto('/create')

    // Fill the YouTube URL and submit — NO page.route() mocking, real request goes to backend
    const urlInput = page.getByTestId('create-lesson-youtube-url-input')
    await urlInput.fill(VALID_YOUTUBE_URL)

    const btn = page.getByTestId('create-lesson-generate-button')
    await expect(btn).toBeEnabled({ timeout: 10_000 })

    // Capture the job_id from the real POST response
    const [generateResp] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/api/lessons/generate') && resp.status() === 200,
        { timeout: 30_000 },
      ),
      btn.click(),
    ])

    const { job_id: jobId } = await generateResp.json()
    expect(jobId).toBeTruthy()
    console.warn(`[integration] job started: ${jobId}`)

    // Queued confirmation should appear immediately after POST succeeds
    await expect(page.getByTestId('create-lesson-queued-confirmation')).toBeVisible({ timeout: 5_000 })

    // Navigate to Library — poller starts on LessonsContext mount
    await page.goto('/')

    // Find the lesson card that was just created (it will be in processing state initially)
    const processingCard = page.getByTestId('lesson-card-processing')
    await expect(processingCard).toBeVisible({ timeout: 15_000 })
    console.warn('[integration] lesson card is in processing state — pipeline running on backend')

    // Wait for the pipeline to finish — card transitions to either complete or error
    const completeCard = page.locator('[data-testid^="lesson-card-"][data-status="complete"]')
    const errorCard = page.locator('[data-testid^="lesson-card-"][data-status="error"]')

    await expect(completeCard.or(errorCard)).toBeVisible({ timeout: PIPELINE_TIMEOUT_MS })

    // Fail with useful context if the backend pipeline errored
    if (await errorCard.isVisible()) {
      const errorText = await page.getByTestId('lesson-card-error-badge').textContent().catch(() => '(no badge text)')
      throw new Error(`Backend pipeline failed — card shows error state. Badge: "${errorText}". Check backend logs for job ${jobId}.`)
    }

    console.warn('[integration] lesson card transitioned to complete — pipeline finished')

    // Verify segments were persisted in IDB
    const lessonId = await completeCard.getAttribute('data-testid')
      .then(testId => testId?.replace('lesson-card-', '') ?? null)

    expect(lessonId).toBeTruthy()

    const segments = await page.evaluate(async (lid) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })
      const result = await new Promise<any>((resolve, reject) => {
        const tx = db.transaction('segments', 'readonly')
        const req = tx.objectStore('segments').get(lid!)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result)
      })
      db.close()
      return result
    }, lessonId)

    expect(Array.isArray(segments)).toBe(true)
    expect(segments.length).toBeGreaterThan(0)
    console.warn(`[integration] ${segments.length} segments persisted in IDB`)
  })
})
