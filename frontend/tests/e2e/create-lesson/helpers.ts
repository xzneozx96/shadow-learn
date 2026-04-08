/**
 * helpers.ts
 *
 * Shared helpers for create-lesson E2E tests.
 *
 * Rules:
 * - All page.route() intercepts must be registered BEFORE page.goto() or any action
 *   that triggers the intercepted request.
 * - Auth bypass uses addInitScript so it re-runs on every navigation.
 */

import type { Page, Route } from '@playwright/test'
import { expect } from '@playwright/test'
import { seedLesson } from '../support/idb-helpers'

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Bypass the PIN / auth gate by setting trial mode in sessionStorage.
 * Call this once per test; addInitScript persists for the lifetime of the Page.
 */
export async function authBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('shadowlearn_trial', 'trial')
    localStorage.setItem('shadowlearn:whats-new:last-seen', Date.now().toString())
  })
}

// ── API mocks ─────────────────────────────────────────────────────────────────

/** Mock GET /api/config to return a valid sttProvider so the Generate button becomes enabled. */
export async function mockConfig(page: Page, sttProvider = 'deepgram'): Promise<void> {
  await page.route('**/api/config', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stt_provider: sttProvider, tts_provider: 'minimax', free_trial_available: true }),
    })
  })
}

/**
 * Mock a successful POST /api/lessons/generate (YouTube) or
 * POST /api/lessons/generate-upload (file upload).
 * Returns { job_id: 'test-job-123' }.
 */
export async function mockGenerateSuccess(page: Page, jobId = 'test-job-123'): Promise<void> {
  await page.route('**/api/lessons/generate', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: jobId }),
    })
  })
  await page.route('**/api/lessons/generate-upload', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: jobId }),
    })
  })
}

/**
 * Mock a failed POST /api/lessons/generate* with a 4xx status.
 * Mimics the FastAPI error envelope: { detail: message }.
 */
export async function mockGenerateError(
  page: Page,
  status = 400,
  detail = 'Invalid YouTube URL',
): Promise<void> {
  await page.route('**/api/lessons/generate', (route: Route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ detail }),
    })
  })
  await page.route('**/api/lessons/generate-upload', (route: Route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ detail }),
    })
  })
}

export type JobStatus = 'processing' | 'complete' | 'error'

interface JobStatusOptions {
  status: JobStatus
  /** Step currently active (used when status === 'processing') */
  step?: string
  /** Human-readable error (used when status === 'error') */
  error?: string
}

/**
 * Mock GET /api/jobs/:jobId to return the given status.
 * Call multiple times with different statuses to simulate progression:
 * first call returns 'processing', second returns 'complete', etc.
 */
export async function mockJobStatus(
  page: Page,
  jobId: string,
  opts: JobStatusOptions,
): Promise<void> {
  await page.route(`**/api/jobs/${jobId}`, (route: Route) => {
    const body: Record<string, unknown> = {
      job_id: jobId,
      status: opts.status,
      step: opts.step ?? null,
      error: opts.error ?? null,
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

/**
 * Convenience: sets up a two-phase job mock — first call returns 'processing',
 * subsequent calls return 'complete'.
 */
export async function mockJobProgressing(page: Page, jobId: string): Promise<void> {
  let callCount = 0
  await page.route(`**/api/jobs/${jobId}`, (route: Route) => {
    callCount++
    if (callCount === 1) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: jobId,
          status: 'processing',
          step: 'transcription',
          error: null,
        }),
      })
    }
    else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: jobId,
          status: 'complete',
          step: null,
          error: null,
        }),
      })
    }
  })
}

// ── Job error surfacing (Library LessonCard) ────────────────────────────────

interface SeedAndExpectJobErrorOptions {
  /** Unique lesson id for IDB seed. */
  lessonId: string
  /** Display title for the seeded lesson. */
  title: string
  /** Lesson source type. */
  source: 'youtube' | 'upload'
  /** Source URL (null for upload lessons). */
  sourceUrl: string | null
  /** Job ID that the poller will poll. */
  jobId: string
  /** Human-readable error message the job poll returns. */
  errorMessage: string
  /** Timeout for the error card to appear (default 20 000 ms). */
  timeout?: number
}

/**
 * Seeds a processing lesson into IDB, reloads the Library page, and waits for
 * the job poller to surface the error in a LessonCard.
 *
 * Expects:
 *   - `authBypass()`, `mockConfig()`, and `mockJobStatus()` already called.
 *   - Page is at the app origin (e.g. after `page.goto('/')`).
 */
export async function seedAndExpectJobError(
  page: Page,
  opts: SeedAndExpectJobErrorOptions,
): Promise<void> {
  await seedLesson(page, {
    id: opts.lessonId,
    title: opts.title,
    source: opts.source,
    sourceUrl: opts.sourceUrl,
    translationLanguages: ['en'],
    sourceLanguage: 'zh',
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    progressSegmentId: null,
    tags: [],
    status: 'processing',
    jobId: opts.jobId,
  } as Parameters<typeof seedLesson>[1] & { status: string, jobId: string })

  await page.reload()

  await expect(page.getByTestId('lesson-card-error')).toBeVisible({ timeout: opts.timeout ?? 20_000 })
  await expect(page.getByTestId('lesson-card-error-badge')).toBeVisible()
}
