import type { Digest, Json } from './canonical'
import type { ManifestStore, MediaKey } from './exportStores'
import type { ApiClient } from '@/db'
import { responseError } from '@/shared/lib/api'
import { storeDigest } from './canonical'

export interface QuarantinedRecord {
  store: ManifestStore
  recordId: string
  raw: Json
  error: Json
}

export interface SentMedia {
  key: MediaKey
  size: number
  sha256: string
}

export interface Ledger {
  source: string
  stores: Map<ManifestStore, StoreLedger>
  quarantine: Map<string, QuarantinedRecord>
  media: SentMedia[]
  unsentMedia: MediaKey[]
  hashMs: number
}

/**
 * `expected` holds what each hashed record must equal: the local record for `stored`,
 * the server's merge for `merged`. `present` lists `kept_server` ids, where a rule kept
 * the account's copy on purpose, so they only need to exist.
 */
export interface StoreLedger {
  expected: Map<string, Json>
  present: Set<string>
  missing: string[]
  belowLocal: string[]
}

function freshStoreLedger(): StoreLedger {
  return { expected: new Map(), present: new Set(), missing: [], belowLocal: [] }
}

export function emptyLedger(source: string, stores: readonly ManifestStore[]): Ledger {
  return {
    source,
    stores: new Map(stores.map(store => [store, freshStoreLedger()])),
    quarantine: new Map(),
    media: [],
    unsentMedia: [],
    hashMs: 0,
  }
}

export function storeLedger(ledger: Ledger, store: ManifestStore): StoreLedger {
  let entry = ledger.stores.get(store)
  if (!entry) {
    entry = freshStoreLedger()
    ledger.stores.set(store, entry)
  }
  return entry
}

export function quarantineKey(record: Pick<QuarantinedRecord, 'store' | 'recordId'>): string {
  return `${record.store}:${record.recordId}`
}

export interface ManifestResponse {
  stores: Record<string, Digest>
  present?: Record<string, number>
  quarantine: Digest
  media: (SentMedia['key'] & { size: number, sha256: string } | null)[]
}

export type Check
  = | { kind: 'store', store: ManifestStore, count: number, ok: boolean, missing: number, belowLocal: number, absent: number }
    | { kind: 'quarantine', count: number, ok: boolean }
    | { kind: 'media', key: MediaKey, ok: boolean }

export interface Verification {
  ok: boolean
  checks: Check[]
}

function sameDigest(a: Digest | undefined, b: Digest): boolean {
  return a !== undefined && a.count === b.count && a.sha256 === b.sha256
}

export async function postManifest(
  api: ApiClient,
  body: { source: string, stores: Record<string, string[]>, present?: Record<string, string[]>, quarantine?: { store: string, recordId: string }[], media?: MediaKey[] },
): Promise<ManifestResponse> {
  const started = performance.now()
  const res = await api.fetch('/api/import/manifest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw await responseError(res, `Verification request failed: ${res.status}`)
  const manifest: ManifestResponse = await res.json()
  performance.measure('manifest server', { start: started })
  return manifest
}

export async function verify(api: ApiClient, ledger: Ledger): Promise<Verification> {
  const started = performance.now()
  const local = await Promise.all(Array.from(ledger.stores, async ([store, { expected: records, present, missing, belowLocal }]) => ({
    store,
    ids: [...records.keys()],
    present: [...present],
    missing: missing.length,
    belowLocal: belowLocal.length,
    digest: await storeDigest(records),
  })))
  const quarantined = [...ledger.quarantine.values()]
  const quarantineDigest = await storeDigest(quarantined.map(record => [quarantineKey(record), record.raw]))
  performance.measure('manifest client', { start: started - ledger.hashMs, end: performance.now() })

  const server = await postManifest(api, {
    source: ledger.source,
    stores: Object.fromEntries(local.map(({ store, ids }) => [store, ids])),
    present: Object.fromEntries(local.filter(({ present }) => present.length > 0).map(({ store, present }) => [store, present])),
    quarantine: quarantined.map(({ store, recordId }) => ({ store, recordId })),
    media: ledger.media.map(item => item.key),
  })

  const checks: Check[] = local.map(({ store, present, missing, belowLocal, digest }) => {
    const absent = present.length - (server.present?.[store] ?? 0)
    return {
      kind: 'store',
      store,
      count: digest.count + present.length + missing,
      missing,
      belowLocal,
      absent,
      ok: missing === 0 && belowLocal === 0 && absent === 0 && sameDigest(server.stores[store], digest),
    }
  })
  checks.push({ kind: 'quarantine', count: quarantined.length, ok: sameDigest(server.quarantine, quarantineDigest) })
  for (const key of ledger.unsentMedia)
    checks.push({ kind: 'media', key, ok: false })
  ledger.media.forEach((item, i) => {
    const stored = server.media[i]
    checks.push({ kind: 'media', key: item.key, ok: stored?.size === item.size && stored?.sha256 === item.sha256 })
  })
  return { ok: checks.every(check => check.ok), checks }
}
