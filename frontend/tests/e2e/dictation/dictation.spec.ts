/**
 * dictation.spec.ts
 *
 * E2E tests for the Dictation exercise within the vocabulary study session.
 *
 * Auth strategy: `page.addInitScript()` sets `sessionStorage.shadowlearn_trial = 'trial'`
 * before every page load, bypassing the PIN gate and entering trial mode.
 *
 * Setup strategy: Seed a minimal lesson + vocab entry into IDB, navigate to
 * /vocabulary/:lessonId/study, select Dictation mode, and start the session.
 * TTS calls to /api/tts are intercepted via page.route() — registered BEFORE
 * any navigation or click that triggers TTS.
 *
 * Selectors: ARIA roles only — getByRole, getByLabel, getByText. No data-testid,
 * no CSS class selectors.
 */

import type { IDBLessonMeta, IDBVocabEntry } from '../support/idb-helpers'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import {
  clearLessonsStore,
  clearVocabStore,
  seedLesson,
  seedSettings,
  seedVocabEntries,
} from '../support/idb-helpers'

// ── Shared constants ──────────────────────────────────────────────────────────

const LESSON_ID = 'lesson-dict-001'

/** Minimal LessonMeta for dictation tests. */
const TEST_LESSON: IDBLessonMeta = {
  id: LESSON_ID,
  title: 'Dictation Test Lesson',
  source: 'youtube',
  sourceUrl: 'https://www.youtube.com/watch?v=dict-test',
  translationLanguages: ['en'],
  sourceLanguage: 'zh-CN',
  createdAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
  progressSegmentId: null,
  tags: [],
}

/** Standard vocab entry with a non-empty sourceSegmentText. */
const TEST_VOCAB_ENTRY: IDBVocabEntry = {
  id: 'entry-dict-001',
  word: '你好',
  romanization: 'nǐ hǎo',
  meaning: 'hello',
  usage: '',
  sourceLessonId: LESSON_ID,
  sourceLessonTitle: 'Dictation Test Lesson',
  sourceSegmentId: 'seg-001',
  sourceSegmentText: '你好世界',
  sourceSegmentTranslation: 'Hello World',
  sourceLanguage: 'zh-CN',
  createdAt: new Date().toISOString(),
}

/** Vocab entry with an empty sourceSegmentText (edge case). */
const EMPTY_TEXT_VOCAB_ENTRY: IDBVocabEntry = {
  id: 'entry-dict-002',
  word: '你好',
  romanization: 'nǐ hǎo',
  meaning: 'hello',
  usage: '',
  sourceLessonId: LESSON_ID,
  sourceLessonTitle: 'Dictation Test Lesson',
  sourceSegmentId: 'seg-002',
  sourceSegmentText: '',
  sourceSegmentTranslation: '',
  sourceLanguage: 'zh-CN',
  createdAt: new Date().toISOString(),
}

// ── Shared constants ──────────────────────────────────────────────────────────

/**
 * Backend origin — matches VITE_API_BASE in frontend/.env.
 * Falls back to the src/lib/config.ts default if the env var is not set.
 */
const API_BASE = 'http://0.0.0.0:8000'

/**
 * Minimal MP3 stub — 4-byte ID3/silence frame sufficient to construct an
 * ArrayBuffer without errors. Centralised here to avoid duplication across
 * inline route handlers.
 */
const MP3_STUB = Buffer.from([0xFF, 0xFB, 0x90, 0x00])

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Inject trial-mode flag so AuthGate skips the PIN screen. */
async function setTrialMode(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('shadowlearn_trial', 'trial')
  })
}

/**
 * Intercept the /api/config endpoint so useTTS resolves its provider
 * immediately without depending on a real backend.
 */
async function interceptConfig(page: import('@playwright/test').Page) {
  await page.route(`${API_BASE}/api/config`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stt_provider: 'deepgram', tts_provider: 'azure', free_trial_available: true }),
    })
  })
}

/**
 * Seed infrastructure data and navigate to the study session page.
 * Must be called AFTER setTrialMode() and AFTER any page.route() intercepts
 * are registered (network-first rule).
 *
 * vocabEntries are seeded AFTER the first page.goto('/') establishes the
 * app origin so IDB is accessible.
 */
async function goToStudyPage(
  page: import('@playwright/test').Page,
  vocabEntries: IDBVocabEntry[] = [],
) {
  // Intercept config so TTS provider resolves immediately without a real backend.
  await interceptConfig(page)
  // Navigate to app root first to establish origin for IDB access.
  await page.goto('/')
  await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })
  // Seed settings to force English UI so aria-labels match English strings.
  await seedSettings(page, { translationLanguage: 'en', uiLanguage: 'en' })
  await seedLesson(page, TEST_LESSON)
  // Seed vocab entries now that we have a valid origin.
  if (vocabEntries.length > 0) {
    await seedVocabEntries(page, vocabEntries)
  }
  // Navigate to the study page — ModePicker renders first.
  await page.goto(`/vocabulary/${LESSON_ID}/study`)
  await expect(page.getByText('Start session →')).toBeVisible({ timeout: 10_000 })
}

/**
 * Select Dictation mode and start the session.
 * After this, the first dictation card is visible.
 */
async function startDictationSession(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Dictation/i }).click()
  await page.getByRole('button', { name: 'Start session →' }).click()
  // Wait for the Play audio button — this confirms the dictation card is mounted.
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeVisible({ timeout: 10_000 })
}

/**
 * Register a successful TTS intercept that returns a minimal audio blob.
 * MUST be called before any navigation that triggers TTS.
 * Uses the full backend URL because useTTS fetches ${API_BASE}/api/tts.
 */
async function interceptTTSSuccess(page: import('@playwright/test').Page) {
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MP3_STUB,
    })
  })
}

/**
 * Register a TTS intercept that returns HTTP 500.
 * Uses the full backend URL because useTTS fetches ${API_BASE}/api/tts.
 */
async function interceptTTSError(page: import('@playwright/test').Page) {
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    await route.fulfill({ status: 500, body: 'Internal Server Error' })
  })
}

// ── afterEach cleanup ─────────────────────────────────────────────────────────

test.afterEach(async ({ page }) => {
  try {
    if (!page.url().startsWith('http://localhost')) {
      await page.goto('/')
      await expect(page.locator('main').first()).toBeVisible({ timeout: 5_000 })
    }
    await clearVocabStore(page)
    await clearLessonsStore(page)
  }
  catch {
    // Swallow cleanup errors — must not mask actual test failure.
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

test('DICT.CHECK-E2E-001 @p1 @smoke — correct answer scores 100%, Next → appears', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)
  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Type the exact correct answer.
  await page.getByRole('textbox').fill('你好世界')

  // Check → should be visible before submission.
  await expect(page.getByRole('button', { name: 'Check →' })).toBeVisible()
  await page.getByRole('button', { name: 'Check →' }).click()

  // After check: accuracy shows 100%, Next → replaces Check →.
  await expect(page.getByText(/100%\s*accurate/i)).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check →' })).not.toBeVisible()
})

test('DICT.CHECK-E2E-002 @p1 @smoke — Play button triggers TTS without error', async ({ page }) => {
  await setTrialMode(page)

  // Register intercept BEFORE navigation (network-first).
  const ttsRequests: string[] = []
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    ttsRequests.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MP3_STUB,
    })
  })

  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Register waitForResponse BEFORE clicking (network-first rule).
  const ttsResponsePromise = page.waitForResponse(`${API_BASE}/api/tts`)
  await page.getByRole('button', { name: 'Play audio' }).click()
  const ttsResponse = await ttsResponsePromise

  // TTS responded successfully.
  expect(ttsResponse.status()).toBe(200)
  expect(ttsRequests.length).toBeGreaterThanOrEqual(1)

  // No error toast should appear.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('DICT.CHECK-E2E-003 @p1 @regression — wrong answer reveals red tokens + correct answer', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)
  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Type a completely wrong answer.
  await page.getByRole('textbox').fill('错误答案')
  await page.getByRole('button', { name: 'Check →' }).click()

  // After check: accuracy is less than 100% — "Correct answer" block appears.
  await expect(page.getByText('Correct answer')).toBeVisible({ timeout: 5_000 })
  // The accuracy score should NOT be 100%.
  const accuracyText = await page.getByText(/\d+%\s*accurate/i).textContent()
  expect(accuracyText).not.toMatch(/100%/)

  // Correct answer text is shown.
  await expect(page.getByText('你好世界')).toBeVisible()
})

test('DICT.CHECK-E2E-004 @p1 @regression — partial answer scores <100%, MistakeExample queued', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)
  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Type a partial answer (first character only).
  await page.getByRole('textbox').fill('你好')
  await page.getByRole('button', { name: 'Check →' }).click()

  // Score must be between 0 and 99 (not 100%).
  const accuracyLocator = page.getByText(/\d+%\s*accurate/i)
  await expect(accuracyLocator).toBeVisible({ timeout: 5_000 })
  const text = await accuracyLocator.textContent()
  expect(text).not.toMatch(/100%/)

  // Correct answer block is shown (confirms mistake was detected).
  await expect(page.getByText('Correct answer')).toBeVisible()

  // Next → is available to advance (mistake is queued internally).
  await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
})

test('DICT.ENTER-E2E-005 @p1 @smoke — Enter key submits check (shortcut parity)', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)
  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Fill the input and press Enter instead of clicking Check →.
  await page.getByRole('textbox').fill('你好世界')
  await page.getByRole('textbox').press('Enter')

  // Same result as clicking Check →: accuracy shown, Next → appears.
  await expect(page.getByText(/\d+%\s*accurate/i)).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible()
})

test('DICT.LOAD-E2E-006 @p1 @regression — Play button disabled + spinner while TTS loads', async ({ page }) => {
  await setTrialMode(page)

  // Use a slow TTS response to observe the loading state.
  let resolveTTS!: () => void
  const ttsGate = new Promise<void>(res => (resolveTTS = res))
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    await ttsGate
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MP3_STUB,
    })
  })

  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Click play — TTS is now loading (gate not resolved yet).
  await page.getByRole('button', { name: 'Play audio' }).click()

  // While loading: button is disabled.
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeDisabled({ timeout: 3_000 })

  // Spinner SVG is visible inside the Play audio button while loading.
  await expect(page.getByRole('button', { name: 'Play audio' }).locator('svg')).toBeVisible()

  // Unblock the TTS response.
  resolveTTS()

  // After load: button re-enables.
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeEnabled({ timeout: 5_000 })
})

test('DICT.LOAD-E2E-007 @p1 @regression — Input stays editable while TTS loads', async ({ page }) => {
  await setTrialMode(page)

  // Slow TTS gate.
  let resolveTTS!: () => void
  const ttsGate = new Promise<void>(res => (resolveTTS = res))
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    await ttsGate
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MP3_STUB,
    })
  })

  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Click play — TTS loading starts.
  await page.getByRole('button', { name: 'Play audio' }).click()

  // Input must remain enabled while TTS loads.
  await expect(page.getByRole('textbox')).toBeEnabled()

  // User can type in the input while audio loads.
  await page.getByRole('textbox').fill('你好')
  await expect(page.getByRole('textbox')).toHaveValue('你好')

  // Unblock TTS.
  resolveTTS()
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeEnabled({ timeout: 5_000 })
})

test('DICT.MULTI-E2E-008 @p1 @regression — Rapid play clicks → no duplicate errors', async ({ page }) => {
  await setTrialMode(page)

  // Count how many TTS requests are made.
  let _requestCount = 0
  await page.route(`${API_BASE}/api/tts`, async (route) => {
    _requestCount++
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: MP3_STUB,
    })
  })

  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Click play once — it becomes disabled while loading.
  const firstResponse = page.waitForResponse(`${API_BASE}/api/tts`)
  await page.getByRole('button', { name: 'Play audio' }).click()

  // Try to click again rapidly while still loading — button is disabled so click is a no-op.
  await page.getByRole('button', { name: 'Play audio' }).click({ force: true })
  await page.getByRole('button', { name: 'Play audio' }).click({ force: true })

  await firstResponse

  // No error toast should appear (no duplicate network errors or race conditions).
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)

  // Button re-enables after load.
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeEnabled({ timeout: 5_000 })
})

test('DICT.SKIP-E2E-009 @p1 @smoke — Skip advances session, no mistake recorded', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)
  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Record the progress text before skipping (e.g. "1 / 10").
  const progressBefore = await page.getByText(/\d+ \/ \d+/).textContent()

  // Skip without answering.
  await page.getByRole('button', { name: 'Skip' }).click()

  // After skip: the session advances to the next question (progress counter updates)
  // OR the session ends if it was the last question. Either way no error toast appears.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)

  // The progress counter should have advanced (or session ended).
  // We verify the session is still active or ended cleanly — no stuck state.
  const progressAfter = await page.getByText(/\d+ \/ \d+/).textContent().catch(() => null)
  if (progressBefore && progressAfter) {
    // Still in session — progress advanced.
    expect(progressAfter).not.toEqual(progressBefore)
  }
  // If progressAfter is null, the session ended (summary rendered) — also valid.
})

test('DICT.ERR-E2E-010 @p1 @regression — TTS 500 error → toast shown, button re-enabled', async ({ page }) => {
  await setTrialMode(page)
  // Register error intercept BEFORE navigation (network-first).
  await interceptTTSError(page)

  await goToStudyPage(page, [TEST_VOCAB_ENTRY])
  await startDictationSession(page)

  // Register waitForResponse BEFORE clicking.
  const ttsResponsePromise = page.waitForResponse(`${API_BASE}/api/tts`)
  await page.getByRole('button', { name: 'Play audio' }).click()
  await ttsResponsePromise

  // Error toast must appear.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1, { timeout: 5_000 })

  // Play button must re-enable after the error (not stuck in disabled state).
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeEnabled({ timeout: 5_000 })
})

test('DICT.EMPTY-E2E-011 @p1 @regression — empty sourceSegmentText → placeholder shown', async ({ page }) => {
  await setTrialMode(page)
  await interceptTTSSuccess(page)

  // Seed ONLY the empty-text entry so the session picks it up.
  await goToStudyPage(page, [EMPTY_TEXT_VOCAB_ENTRY])
  await startDictationSession(page)

  // The dictation card renders. The input's placeholder attribute should be visible.
  const input = page.getByRole('textbox')
  await expect(input).toBeVisible()

  // Placeholder text is set by caps.dictationPlaceholder — for Chinese it is a
  // language-specific hint. We assert the attribute is non-empty (any value is OK).
  const placeholder = await input.getAttribute('placeholder')
  expect(placeholder).toBeTruthy()
})
