import type { ShadowLearnDB } from '@/db/legacy'
import { unwrap } from 'idb'
import { initDB } from '@/db/legacy'

export const LEGACY_DB_NAME = 'shadowlearn'

export const IN_SCOPE_STORES = [
  'lessons',
  'segments',
  'videos',
  'settings',
  'vocabulary',
  'learner-profile',
  'progress-db',
  'mastery-db',
  'spaced-repetition',
  'session-logs',
  'mistakes-db',
  'agent-memory',
  'exercise-stats',
  'daily-tasks',
  'speak-sessions',
  'shadowing-bests',
  'shadowing-audio',
  'tip-progress',
  'tip-notes',
  'user-materials',
  'threads',
  'thread-summaries',
  'tip-cards',
  'word-breakdowns',
] as const

export interface LegacyData {
  present: boolean
  counts: Record<string, number>
}

/**
 * Open the legacy database with a handler that lets a delete from another tab proceed.
 * Opening upgrades any older schema to v21.
 */
export async function openLegacy(): Promise<ShadowLearnDB> {
  const db = await initDB()
  unwrap(db).addEventListener('versionchange', () => db.close())
  return db
}

/** False when the browser cannot list databases at all, since then it cannot hold a legacy one either. */
async function legacyDatabaseExists(): Promise<boolean> {
  if (typeof indexedDB.databases !== 'function')
    return true
  try {
    return (await indexedDB.databases()).some(info => info.name === LEGACY_DB_NAME)
  }
  catch {
    return false
  }
}

export function deleteLegacyDatabase(onBlocked: () => void = () => {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = onBlocked
  })
}

async function countStores(db: ShadowLearnDB): Promise<Record<string, number>> {
  const names = unwrap(db).objectStoreNames
  const counts: Record<string, number> = {}
  for (const store of IN_SCOPE_STORES) {
    if (names.contains(store))
      counts[store] = await db.count(store)
  }
  if (await db.get('crypto', 'keys'))
    counts.keys = 1
  return counts
}

/** Report whether this device holds data to import. A database that holds only dropped stores is deleted. */
export async function detectLegacyData(): Promise<LegacyData> {
  if (!(await legacyDatabaseExists()))
    return { present: false, counts: {} }
  const db = await openLegacy()
  const counts = await countStores(db)
  db.close()
  if (Object.values(counts).some(count => count > 0))
    return { present: true, counts }
  await deleteLegacyDatabase()
  return { present: false, counts }
}
