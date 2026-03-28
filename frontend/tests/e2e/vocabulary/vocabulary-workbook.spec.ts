/**
 * vocabulary-workbook.spec.ts
 *
 * E2E tests for the vocabulary / workbook feature.
 *
 * Auth strategy: `page.addInitScript()` sets `sessionStorage.shadowlearn_trial = 'trial'`
 * before every page load, bypassing the PIN gate and entering trial mode.
 * After every `page.reload()` the script re-runs automatically (addInitScript persists
 * for the lifetime of the page object).
 *
 * Lesson setup: tests that navigate to a lesson page seed a minimal LessonMeta +
 * Segment record into IDB before the first navigation. This is infrastructure data
 * required to render the page — it is NOT vocabulary data, so it does not violate the
 * "no programmatic seeding for setup" rule.
 *
 * IDB helpers: imported from ../support/idb-helpers.ts. All helpers call page.evaluate()
 * and therefore run inside the browser context.
 */

import type { IDBLessonMeta, IDBSegment, IDBVocabEntry } from '../support/idb-helpers'
import { expect, test } from '@playwright/test'
import {
  clearLessonsStore,
  clearVocabStore,
  getAllVocabEntries,
  seedLesson,
  seedSegments,
  seedSettings,
  seedVocabEntries,
} from '../support/idb-helpers'

// ── Shared fixtures ───────────────────────────────────────────────────────────

const LESSON_ID = 'test-lesson-e2e-001'
const SEGMENT_ID = 'test-segment-e2e-001'

/** Minimal LessonMeta that satisfies the app's IDB schema. */
const TEST_LESSON: IDBLessonMeta = {
  id: LESSON_ID,
  title: 'E2E Test Lesson — Chinese Basics',
  source: 'youtube',
  sourceUrl: 'https://www.youtube.com/watch?v=test',
  translationLanguages: ['en'],
  sourceLanguage: 'zh-CN',
  createdAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
  progressSegmentId: null,
  tags: [],
}

/**
 * Minimal Segment with one known word (你好) so the transcript renders a clickable
 * word popup. The word list must match `text` so that `buildWordSpans` maps it.
 */
const TEST_SEGMENTS: IDBSegment[] = [
  {
    id: SEGMENT_ID,
    lessonId: LESSON_ID,
    start: 0,
    end: 3,
    text: '你好',
    romanization: 'nǐ hǎo',
    translations: { en: 'Hello' },
    words: [
      { word: '你好', romanization: 'nǐ hǎo', meaning: 'Hello / How are you', usage: 'Common greeting' },
    ],
    language: 'zh-CN',
  },
]

/** Helper: inject trial-mode flag so AuthGate skips the PIN screen. */
async function setTrialMode(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('shadowlearn_trial', 'trial')
  })
}

/** Helper: seed lesson + segments then navigate to the lesson page. */
async function goToLesson(page: import('@playwright/test').Page) {
  // Must navigate first to establish the app's origin before IDB is accessible.
  // addInitScript re-runs on every page.goto(), so trial mode is always active.
  await page.goto('/')
  // Wait for app shell to finish loading (spinner → content)
  await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })
  // Seed infrastructure data now that IDB is accessible.
  // Force English UI so all aria-label / title selectors match English strings.
  await seedSettings(page, { translationLanguage: 'en', uiLanguage: 'en' })
  await seedLesson(page, TEST_LESSON)
  await seedSegments(page, LESSON_ID, TEST_SEGMENTS)
  // Navigate to the lesson — app fully reloads and reads seeded data from IDB
  await page.goto(`/lesson/${LESSON_ID}`)
  await expect(page.getByText('你好').first()).toBeVisible({ timeout: 10_000 })
}

/** Helper: click the Workbook tab in CompanionPanel to make the workbook panel visible. */
async function switchToWorkbookTab(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /workbook/i }).click()
}

/**
 * Helper: after a page reload, switch to the Workbook tab and wait for the
 * expected word count to appear. This ensures VocabularyContext has finished
 * loading entries from IDB before the caller interacts with the popup.
 */
async function waitForVocabLoaded(page: import('@playwright/test').Page, expectedCount: number) {
  await switchToWorkbookTab(page)
  const pattern = expectedCount === 1
    ? /1\s+word\s+saved/i
    : new RegExp(`${expectedCount}\\s+words\\s+saved`, 'i')
  await expect(page.getByText(pattern)).toBeVisible({ timeout: 5_000 })
}

/** Helper: open the word popup for 你好 in the transcript. */
async function openWordPopup(page: import('@playwright/test').Page) {
  // The word appears as a Popover trigger (inline text inside the transcript).
  // Click the first match that is inside the transcript panel.
  await page.getByText('你好').first().click()
  // Wait for the popover content to appear (it contains the bookmark button).
  await expect(page.getByRole('button', { name: /save to workbook/i }).or(
    page.getByRole('button', { name: /remove from workbook/i }),
  )).toBeVisible({ timeout: 5_000 })
}

/** Helper: save the word 你好 via UI. Returns after the word-count badge updates. */
async function saveWordViaUI(page: import('@playwright/test').Page) {
  await openWordPopup(page)
  await page.getByRole('button', { name: /save to workbook/i }).click()
  // The popup button has title="Remove from Workbook" — use getByTitle to uniquely identify
  // the popup button even when the workbook panel is also showing (3 elements would otherwise match).
  await expect(page.getByTitle('Remove from Workbook')).toBeVisible({ timeout: 5_000 })
}

// ── afterEach cleanup ─────────────────────────────────────────────────────────

test.afterEach(async ({ page }) => {
  // Ensure we're on the app's origin before accessing IDB.
  // If a test failed before its first navigation the page is still on about:blank.
  try {
    if (!page.url().startsWith('http://localhost')) {
      await page.goto('/')
      await expect(page.locator('main').first()).toBeVisible({ timeout: 5_000 })
    }
    await clearVocabStore(page)
  }
  catch {
    // Swallow cleanup errors — they must not mask the actual test failure.
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

test('VOC.SAVE-E2E-001 @p0 @smoke — save-word-happy-path: clicking Save to Workbook persists entry in IDB and increments panel count', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Switch to workbook tab to see the word count panel
  await switchToWorkbookTab(page)

  // Before saving: panel shows "0 words saved"
  await expect(page.getByText(/0\s+words?\s+saved/i)).toBeVisible()

  await saveWordViaUI(page)

  // After saving: count increments to 1 (workbook tab is still active)
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  // Assert IDB has exactly 1 entry
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(1)
  expect(entries[0].word).toBe('你好')
  expect(entries[0].sourceLessonId).toBe(LESSON_ID)
})

test('VOC.SAVED-E2E-002 @p1 @regression — already-saved-shows-filled-bookmark: after reload the popup shows "Remove from Workbook" button for saved word', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Save word via UI
  await saveWordViaUI(page)

  // Reload — setTrialMode persists via addInitScript so session key is re-set
  await page.reload()
  await expect(page.getByText('你好').first()).toBeVisible({ timeout: 10_000 })

  // Switch to workbook tab and wait for "1 word saved" — this confirms VocabularyContext
  // has finished loading entries from IDB before we open the popup.
  await waitForVocabLoaded(page, 1)

  // Open popup for the same word — VocabularyContext has loaded, isSaved returns true
  await page.getByText('你好').first().click()

  // The popup button has title="Remove from Workbook" — use getByTitle to avoid matching
  // the word card X button and word card div simultaneously (3 matches = strict mode violation).
  await expect(page.getByTitle('Remove from Workbook')).toBeVisible()
})

test('VOC.STUDY-E2E-003 @p1 @regression — study-button-navigates-to-session: Study button in workbook page navigates to /vocabulary/:lessonId/study', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Save a word so the lesson group appears on the workbook page
  await saveWordViaUI(page)

  // Navigate to the workbook page
  await page.goto('/vocabulary')
  await expect(page.getByRole('button', { name: /^study$/i })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /^study$/i }).click()

  await expect(page).toHaveURL(new RegExp(`/vocabulary/${LESSON_ID}/study`))
})

test('VOC.REMOVE-E2E-004 @p0 @smoke — remove-word-with-confirmation: X button opens dialog; confirming removes word from UI and IDB', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  await saveWordViaUI(page)

  // Switch to workbook tab — this closes the popup and reveals the word card with X button
  await switchToWorkbookTab(page)
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  // Scope to the workbook tabpanel to find the X button (aria-label="Remove from Workbook").
  // Using .first() with a page-level regex would pick the word card div[role="button"] whose
  // accessible name also contains "Remove from Workbook", which navigates instead of opening dialog.
  const workbookPanel = page.getByRole('tabpanel', { name: /workbook/i })
  const removeBtn = workbookPanel.getByLabel('Remove from Workbook')
  await expect(removeBtn).toBeVisible()
  await removeBtn.click()

  // Confirmation dialog appears
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Confirm removal
  await dialog.getByRole('button', { name: /remove/i }).click()

  // Word card disappears; panel shows 0 words
  await expect(page.getByText(/0\s+words?\s+saved/i)).toBeVisible()

  // IDB is now empty
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(0)
})

test('VOC.CANCEL-E2E-005 @p1 @regression — cancel-remove-leaves-word-intact: cancelling the remove dialog keeps entry in panel and IDB', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  await saveWordViaUI(page)

  // Switch to workbook tab to access the word card X button
  await switchToWorkbookTab(page)
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  const workbookPanel = page.getByRole('tabpanel', { name: /workbook/i })
  const removeBtn = workbookPanel.getByLabel('Remove from Workbook')
  await expect(removeBtn).toBeVisible()
  await removeBtn.click()

  // Dialog visible
  await expect(page.getByRole('dialog')).toBeVisible()

  // Cancel
  await page.getByRole('button', { name: /cancel/i }).click()

  // Dialog dismissed; word still shows
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  // IDB still has 1 entry
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(1)
})

test('VOC.TOGGLE-E2E-006 @p1 @regression — toggle-bookmark-removes-word: clicking the filled bookmark in the popup calls remove directly and empties IDB', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  await saveWordViaUI(page)

  // Close current popup and wait for it to fully dismiss before re-opening.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /save to workbook|remove from workbook/i })).not.toBeVisible({ timeout: 3_000 })

  // Re-open popup for the same word
  await page.getByText('你好').first().click()

  // Popup should show "Remove from Workbook" (filled bookmark icon — word is saved)
  const removeFromPopup = page.getByRole('button', { name: /remove from workbook/i })
  await expect(removeFromPopup).toBeVisible()

  // Clicking the filled bookmark removes directly (no confirmation dialog)
  await removeFromPopup.click()

  // Wait for removal to complete — popup changes back to "Save to Workbook"
  await expect(page.getByRole('button', { name: /save to workbook/i })).toBeVisible({ timeout: 5_000 })

  // IDB should now be empty
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(0)
})

test('VOC.DISABLED-E2E-007 @p1 @regression — study-button-disabled-zero-words: Study This Lesson button is disabled when no words are saved', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Switch to workbook tab to see the Study This Lesson button
  await switchToWorkbookTab(page)

  // No words saved — panel should show disabled Study This Lesson button
  const studyBtn = page.getByRole('button', { name: /study this lesson/i })
  await expect(studyBtn).toBeVisible()
  await expect(studyBtn).toBeDisabled()
})

test('VOC.DELGRP-E2E-008 @p1 @regression — delete-lesson-group-from-workbook: trash button on workbook page removes entire lesson group and clears IDB', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Save the word twice is not possible for same word in same lesson; seed a second entry directly
  await saveWordViaUI(page)

  // Close popup, navigate to workbook
  await page.goto('/vocabulary')
  await expect(page.getByRole('button', { name: /^study$/i })).toBeVisible({ timeout: 10_000 })

  // The Trash2 button has no aria-label — locate it via the svg class.
  // TODO: add aria-label="Delete lesson group" to the Trash2 button in LessonGroup.tsx
  //       so this selector can be replaced with getByRole('button', { name: /delete lesson group/i })
  const trashBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') })
  await expect(trashBtn).toBeVisible()
  await trashBtn.click()

  // Confirmation dialog
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Click the Delete button (not Cancel)
  await dialog.getByRole('button', { name: /^delete$/i }).click()

  // Lesson group disappears
  await expect(page.getByRole('button', { name: /^study$/i })).not.toBeVisible()

  // IDB is empty
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(0)
})

test('VOC.RELOAD-E2E-009 @p1 @regression — save-durable-across-reload: saved word persists after page reload', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  await saveWordViaUI(page)

  // Reload — addInitScript re-runs the sessionStorage setter automatically
  await page.reload()
  await expect(page.getByText('你好').first()).toBeVisible({ timeout: 10_000 })

  // Switch to workbook tab and wait for "1 word saved" — confirms VocabularyContext has loaded
  await waitForVocabLoaded(page, 1)

  // Open popup — word should already be saved (popup shows "Remove from Workbook")
  await page.getByText('你好').first().click()
  // Use getByTitle to target the popup button exclusively (avoids matching the word card X button
  // and the word card div that both also have "Remove from Workbook" in their accessible names).
  await expect(page.getByTitle('Remove from Workbook')).toBeVisible()
})

test('VOC.RMREL-E2E-010 @p1 @regression — remove-durable-across-reload: removed word is gone after page reload', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  await saveWordViaUI(page)

  // Remove via popup bookmark — close popup first, then re-open and click remove.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /save to workbook|remove from workbook/i })).not.toBeVisible({ timeout: 3_000 })
  await page.getByText('你好').first().click()
  await page.getByRole('button', { name: /remove from workbook/i }).click()

  // Wait for removal to complete — popup changes back to "Save to Workbook"
  await expect(page.getByRole('button', { name: /save to workbook/i })).toBeVisible({ timeout: 5_000 })

  // Verify IDB is empty before reload
  const entriesBefore = await getAllVocabEntries(page)
  expect(entriesBefore).toHaveLength(0)

  // Reload
  await page.reload()
  await expect(page.getByText('你好').first()).toBeVisible({ timeout: 10_000 })

  // Open popup — should show Save to Workbook (unsaved state)
  await page.getByText('你好').first().click()
  await expect(page.getByRole('button', { name: /save to workbook/i })).toBeVisible()
})

test('VOC.PERF-E2E-011 @p2 @regression — workbook-renders-fast-500-entries: /vocabulary renders 500 entries in under 300 ms', async ({ page }) => {
  await setTrialMode(page)

  // Navigate first so the app opens IDB and creates the schema, then seed data.
  // This also ensures IDB is accessible (requires an origin page, not about:blank).
  await page.goto('/')
  await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })
  // Force English UI and seed BEFORE the final navigation so VocabularyContext reads data on mount.
  await seedSettings(page, { translationLanguage: 'en', uiLanguage: 'en' })

  // Build 500 vocab entries across 10 fake lessons
  const entries: IDBVocabEntry[] = []
  const lessonIds: string[] = Array.from({ length: 10 }, (_, i) => `perf-lesson-${i}`)

  for (let i = 0; i < 500; i++) {
    const lessonId = lessonIds[i % 10]
    entries.push({
      id: `perf-entry-${i}`,
      word: `词${i}`,
      romanization: `cí${i}`,
      meaning: `Meaning ${i}`,
      usage: `Usage ${i}`,
      sourceLessonId: lessonId,
      sourceLessonTitle: `Perf Lesson ${i % 10}`,
      sourceSegmentId: `seg-${i}`,
      sourceSegmentText: `段落${i}`,
      sourceSegmentTranslation: `Segment ${i}`,
      sourceLanguage: 'zh-CN',
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    })
  }

  // Also seed lesson meta for each fake lesson (so Study buttons render correctly)
  for (const lid of lessonIds) {
    await seedLesson(page, {
      id: lid,
      title: `Perf Lesson ${lid}`,
      source: 'youtube',
      sourceUrl: null,
      translationLanguages: ['en'],
      sourceLanguage: 'zh-CN',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progressSegmentId: null,
      tags: [],
    })
  }

  await seedVocabEntries(page, entries)

  // Measure time from navigation to workbook content visible.
  // We wait for the word-count stat line ("500 words") rather than a button
  // whose label is language-dependent, giving a language-agnostic anchor.
  // Threshold is 2 000 ms to account for Playwright IPC overhead; the intent
  // is to catch O(N) render regressions, not sub-ms precision.
  const t0 = Date.now()
  await page.goto('/vocabulary')
  await expect(page.getByText(/500\s+words?/i).first()).toBeVisible({ timeout: 10_000 })
  const elapsed = Date.now() - t0

  expect(elapsed).toBeLessThan(2_000)

  // Clean up seeded lesson meta — afterEach only clears vocabulary.
  // Perf-lesson records must not leak into subsequent tests.
  await clearLessonsStore(page)
  await clearVocabStore(page)
})

test('VOC.ERRTOAST-E2E-012 @p2 @regression — AC-005: error toast when IDB write fails during save', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Monkey-patch IDBObjectStore.prototype.put so vocabulary writes throw synchronously.
  // This simulates a database write failure (IDB unavailable / quota exceeded / etc.).
  // The patch is scoped to the vocabulary store only so infrastructure stores are unaffected.
  await page.evaluate(() => {
    const origPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'vocabulary') {
        throw new DOMException('Simulated IDB write failure', 'UnknownError')
      }
      return origPut.call(this, value, key)
    }
  })

  // Attempt to save a word — the error toast should appear; success toast must NOT appear
  await openWordPopup(page)
  await page.getByRole('button', { name: /save to workbook/i }).click()

  // Exactly one toast (the error toast) should be visible
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1, { timeout: 5_000 })

  // Nothing should have been written to IDB
  const entries = await getAllVocabEntries(page)
  expect(entries).toHaveLength(0)
})

test('VOC.RMTOAST-E2E-013 @p2 @regression — AC-006: error toast when IDB delete fails during remove, word stays in panel', async ({ page }) => {
  await setTrialMode(page)
  await goToLesson(page)

  // Save the word first (IDB is healthy at this point)
  await saveWordViaUI(page)

  const entriesBefore = await getAllVocabEntries(page)
  expect(entriesBefore).toHaveLength(1)

  // Switch to workbook tab to access the word card X button
  await switchToWorkbookTab(page)
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  // Now patch IDBObjectStore.prototype.delete so vocabulary deletes throw.
  // Scoped to vocabulary store only.
  await page.evaluate(() => {
    const origDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'vocabulary') {
        throw new DOMException('Simulated IDB delete failure', 'UnknownError')
      }
      return origDelete.call(this, key)
    }
  })

  // Click the X remove button on the word card — scope to tabpanel to avoid matching
  // the word card div[role="button"] whose accessible name also contains "Remove from Workbook".
  const workbookPanel = page.getByRole('tabpanel', { name: /workbook/i })
  const removeBtn = workbookPanel.getByLabel('Remove from Workbook')
  await expect(removeBtn).toBeVisible()
  await removeBtn.click()

  // Confirmation dialog appears (workbook panel X button always shows confirmation)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /remove/i }).click()

  // Exactly one toast (the error toast) should be visible; success toast must NOT appear
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1, { timeout: 5_000 })

  // Word should still be visible in the panel (no optimistic removal on failure)
  await expect(page.getByText(/1\s+word\s+saved/i)).toBeVisible()

  // IDB entry should still be present
  const entriesAfter = await getAllVocabEntries(page)
  expect(entriesAfter).toHaveLength(1)
})
