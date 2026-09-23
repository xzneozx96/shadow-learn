/**
 * api-helpers.ts
 *
 * Seed E2E state through the backend instead of IndexedDB. Lesson seeding
 * uses `POST /api/testing/lessons`, which the backend mounts only with
 * `SHADOWLEARN_ENABLE_TEST_ROUTES=true`.
 */

import type { APIRequestContext, Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { expect } from '@playwright/test'

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000'

const WHATS_NEW_TITLE = /what's new|có gì mới/i

export interface TestUser {
  id: string
  email: string
  accessToken: string
  refreshToken: string
}

export interface SeedSegment {
  id: string
  start: number
  end: number
  text: string
  romanization: string
  translations: Record<string, string>
  words: { word: string, romanization: string, meaning: string, usage: string }[]
}

export interface SeedLesson {
  title: string
  source?: 'youtube' | 'upload' | 'blog'
  source_url?: string | null
  duration: number
  source_language?: string
  translation_languages?: string[]
  meta?: Record<string, unknown>
  segments?: SeedSegment[]
  media?: { body: Buffer, contentType: string }
}

export interface PendingLesson {
  id: string
  title: string
  source: 'youtube' | 'upload' | 'blog'
  sourceUrl: string | null
  translationLanguages: string[]
  sourceLanguage: string
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: null
  tags: string[]
  status: 'processing' | 'error'
  jobId?: string
}

function bearer(user: TestUser) {
  return { Authorization: `Bearer ${user.accessToken}` }
}

/** Register a fresh account and start every page load in this test signed in as it. */
export async function signUpAndLogin(page: Page): Promise<TestUser> {
  const email = `e2e-${randomUUID()}@example.com`
  const password = 'correct-horse-battery'
  const created = await page.request.post(`${API_URL}/api/auth/register`, { data: { email, password } })
  expect(created.status(), await created.text()).toBe(201)
  const login = await page.request.post(`${API_URL}/api/auth/login`, { form: { username: email, password } })
  expect(login.status(), await login.text()).toBe(200)
  const tokens: { access_token: string, refresh_token: string } = await login.json()
  const user = { id: (await created.json()).id, email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token }

  await page.addInitScript((refreshToken) => {
    if (!localStorage.getItem('shadowlearn.refresh'))
      localStorage.setItem('shadowlearn.refresh', refreshToken)
  }, user.refreshToken)
  // A fresh account has not seen the latest announcement, so the dialog opens over the page.
  await page.addLocatorHandler(page.getByRole('dialog', { name: WHATS_NEW_TITLE }), async () => {
    await page.keyboard.press('Escape')
  })
  return user
}

/** Insert a lesson, its segments, and optionally its media for `user`. Returns the server lesson id. */
export async function seedLesson(request: APIRequestContext, user: TestUser, lesson: SeedLesson): Promise<string> {
  const { media, ...body } = lesson
  const res = await request.post(`${API_URL}/api/testing/lessons`, { headers: bearer(user), data: body })
  expect(res.status(), await res.text()).toBe(201)
  const { id } = await res.json()
  if (media) {
    const put = await request.put(`${API_URL}/api/testing/lessons/${id}/media`, {
      headers: { ...bearer(user), 'Content-Type': media.contentType },
      data: media.body,
    })
    expect(put.status(), await put.text()).toBe(200)
  }
  return id
}

export async function seedSettings(
  request: APIRequestContext,
  user: TestUser,
  settings: { translationLanguage: string, uiLanguage?: 'en' | 'vi' },
): Promise<void> {
  const res = await request.put(`${API_URL}/api/store/settings/settings`, { headers: bearer(user), data: settings })
  expect(res.status(), await res.text()).toBe(200)
}

/**
 * Store a processing or failed lesson the way the Library keeps it before
 * the server has a row. Call on the app origin, then reload.
 */
export async function seedPendingLesson(page: Page, user: TestUser, lesson: PendingLesson): Promise<void> {
  await page.evaluate(({ key, value }) => {
    const pending = JSON.parse(localStorage.getItem(key) ?? '[]')
    localStorage.setItem(key, JSON.stringify([value, ...pending]))
  }, { key: `shadowlearn.pending-lessons.${user.id}`, value: lesson })
}

export async function readPendingLessons(page: Page, user: TestUser): Promise<PendingLesson[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), `shadowlearn.pending-lessons.${user.id}`)
}
