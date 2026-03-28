/**
 * idb-helpers.ts
 *
 * Utility functions for seeding and querying the ShadowLearn IndexedDB (`shadowlearn`)
 * from within Playwright tests via `page.evaluate()`.
 *
 * All helpers accept a `Page` instance and run in the browser context so that
 * the IDB connection uses the same origin as the app under test.
 *
 * IDB schema version: 7 (matches DB_VERSION in src/db/index.ts)
 */

import type { Page } from '@playwright/test'

// ── Shape mirrors src/types.ts ──────────────────────────────────────────────

export interface IDBLessonMeta {
  id: string
  title: string
  source: 'youtube' | 'upload'
  sourceUrl: string | null
  translationLanguages: string[]
  sourceLanguage: string
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: string | null
  tags: string[]
}

export interface IDBWord {
  word: string
  romanization: string
  meaning: string
  usage: string
}

export interface IDBSegment {
  id: string
  lessonId: string
  start: number
  end: number
  text: string
  romanization: string
  translations: Record<string, string>
  words: IDBWord[]
  language: string
}

export interface IDBVocabEntry {
  id: string
  word: string
  romanization: string
  meaning: string
  usage: string
  sourceLessonId: string
  sourceLessonTitle: string
  sourceSegmentId: string
  sourceSegmentText: string
  sourceSegmentTranslation: string
  sourceLanguage: string
  createdAt: string
}

// ── Low-level: open the DB in the page context ────────────────────────────────

// NOTE: openShadowLearnDB cannot be shared across page.evaluate() calls because
// page.evaluate() serializes functions by reference boundary — each evaluate
// call runs in an isolated browser context. The openDB factory is therefore
// inlined inside each evaluate callback below. This is intentional, not an
// oversight.

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Seed AppSettings into the `settings` object store. */
export async function seedSettings(page: Page, settings: { translationLanguage: string, uiLanguage?: 'en' | 'vi' }): Promise<void> {
  await page.evaluate(async (data) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      const req = tx.objectStore('settings').put(data, 'settings')
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, settings)
}

/** Seed a LessonMeta record into the `lessons` object store. */
export async function seedLesson(page: Page, lesson: IDBLessonMeta): Promise<void> {
  await page.evaluate(async (data) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lessons', 'readwrite')
      const req = tx.objectStore('lessons').put(data)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, lesson)
}

/**
 * Seed Segment records into the `segments` object store.
 * Segments are stored as an array under the lessonId key (not per-segment id).
 */
export async function seedSegments(page: Page, lessonId: string, segments: IDBSegment[]): Promise<void> {
  await page.evaluate(async ({ lessonId, segments }) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('segments', 'readwrite')
      const req = tx.objectStore('segments').put(segments, lessonId)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, { lessonId, segments })
}

/** Seed a single VocabEntry into the `vocabulary` object store. */
export async function seedVocabEntry(page: Page, entry: IDBVocabEntry): Promise<void> {
  await page.evaluate(async (data) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vocabulary', 'readwrite')
      const req = tx.objectStore('vocabulary').put(data)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, entry)
}

/** Seed multiple VocabEntries in a single transaction. */
export async function seedVocabEntries(page: Page, entries: IDBVocabEntry[]): Promise<void> {
  await page.evaluate(async (data) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vocabulary', 'readwrite')
      const pending = data.length
      if (pending === 0) {
        resolve()
        return
      }
      for (const entry of data) {
        const req = tx.objectStore('vocabulary').put(entry)
        req.onerror = () => reject(req.error)
      }
      tx.oncomplete = () => resolve()
    })
    db.close()
  }, entries)
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/** Returns all VocabEntry records from the `vocabulary` store. */
export async function getAllVocabEntries(page: Page): Promise<IDBVocabEntry[]> {
  return page.evaluate(() => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    return openDB().then(db =>
      new Promise<IDBVocabEntry[]>((resolve, reject) => {
        const tx = db.transaction('vocabulary', 'readonly')
        const req = tx.objectStore('vocabulary').getAll()
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          db.close()
          resolve(req.result as IDBVocabEntry[])
        }
      }),
    )
  })
}

/** Returns VocabEntry records for a specific lesson. */
export async function getVocabEntriesByLesson(page: Page, lessonId: string): Promise<IDBVocabEntry[]> {
  return page.evaluate(async (lid) => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    const db = await openDB()
    return new Promise<IDBVocabEntry[]>((resolve, reject) => {
      const tx = db.transaction('vocabulary', 'readonly')
      const idx = tx.objectStore('vocabulary').index('by-lesson')
      const req = idx.getAll(lid)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        db.close()
        resolve(req.result as IDBVocabEntry[])
      }
    })
  }, lessonId)
}

/** Counts all VocabEntry records in the `vocabulary` store. */
export async function countVocabEntries(page: Page): Promise<number> {
  return page.evaluate(() => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    return openDB().then(db =>
      new Promise<number>((resolve, reject) => {
        const tx = db.transaction('vocabulary', 'readonly')
        const req = tx.objectStore('vocabulary').count()
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          db.close()
          resolve(req.result)
        }
      }),
    )
  })
}

/** Clears all records from the `lessons` store. */
export async function clearLessonsStore(page: Page): Promise<void> {
  await page.evaluate(() => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    return openDB().then(db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lessons', 'readwrite')
        const req = tx.objectStore('lessons').clear()
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
      }),
    )
  })
}

/** Clears all records from the `vocabulary` store. */
export async function clearVocabStore(page: Page): Promise<void> {
  await page.evaluate(() => {
    const openDB = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('shadowlearn', 7)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result as IDBDatabase)
      })

    return openDB().then(db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('vocabulary', 'readwrite')
        const req = tx.objectStore('vocabulary').clear()
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
      }),
    )
  })
}
