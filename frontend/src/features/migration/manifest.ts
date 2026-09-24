import type { Digest, Json } from './canonical'
import type { ManifestStore, MediaKey } from './exportStores'
import type { ApiClient } from '@/db'
import { responseError } from '@/shared/lib/api'
import { storeDigest } from './canonical'

export interface QuarantinedRecord {
  store: ManifestStore
  recordId: string
  raw: Json
  error: string
}

export interface SentMedia {
  key: MediaKey
  size: number
  sha256: string
}

/**
 * What this device expects the server to hold for everything it sent.
 * Lessons and segments expect exactly what was sent. Record stores expect the
 * `after` the bulk import returned, because merge rules may keep the account's copy.
 */
export interface Ledger {
  source: string
  stores: Map<ManifestStore, StoreLedger>
  quarantine: Map<string, QuarantinedRecord>
  media: SentMedia[]
  unsentMedia: MediaKey[]
  hashMs: number
}

export interface StoreLedger {
  expected: Map<string, Json>
  missing: string[]
}

export function emptyLedger(source: string, stores: readonly ManifestStore[]): Ledger {
  return {
    source,
    stores: new Map(stores.map(store => [store, { expected: new Map(), missing: [] }])),
    quarantine: new Map(),
    media: [],
    unsentMedia: [],
    hashMs: 0,
  }
}

export function storeLedger(ledger: Ledger, store: ManifestStore): StoreLedger {
  let entry = ledger.stores.get(store)
  if (!entry) {
    entry = { expected: new Map(), missing: [] }
    ledger.stores.set(store, entry)
  }
  return entry
}

export function quarantineKey(record: Pick<QuarantinedRecord, 'store' | 'recordId'>): string {
  return `${record.store}:${record.recordId}`
}

export interface ManifestResponse {
  stores: Record<string, Digest>
  quarantine: Digest
  media: (SentMedia['key'] & { size: number, sha256: string } | null)[]
}

export type Check
  = | { kind: 'store', store: ManifestStore, count: number, ok: boolean, missing: number }
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
  body: { source: string, stores: Record<string, string[]>, quarantine?: { store: string, recordId: string }[], media?: MediaKey[] },
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

/** Compare every store, the quarantine, and every blob. Deletion may follow only when `ok`. */
export async function verify(api: ApiClient, ledger: Ledger): Promise<Verification> {
  const started = performance.now()
  const local = await Promise.all(Array.from(ledger.stores, async ([store, { expected: records, missing }]) => ({
    store,
    ids: [...records.keys()],
    missing: missing.length,
    digest: await storeDigest(records),
  })))
  const quarantined = [...ledger.quarantine.values()]
  const quarantineDigest = await storeDigest(quarantined.map(record => [quarantineKey(record), record.raw]))
  performance.measure('manifest client', { start: started - ledger.hashMs, end: performance.now() })

  const server = await postManifest(api, {
    source: ledger.source,
    stores: Object.fromEntries(local.map(({ store, ids }) => [store, ids])),
    quarantine: quarantined.map(({ store, recordId }) => ({ store, recordId })),
    media: ledger.media.map(item => item.key),
  })

  const checks: Check[] = local.map(({ store, missing, digest }) => ({
    kind: 'store',
    store,
    count: digest.count + missing,
    missing,
    ok: missing === 0 && sameDigest(server.stores[store], digest),
  }))
  checks.push({ kind: 'quarantine', count: quarantined.length, ok: sameDigest(server.quarantine, quarantineDigest) })
  for (const key of ledger.unsentMedia)
    checks.push({ kind: 'media', key, ok: false })
  ledger.media.forEach((item, i) => {
    const stored = server.media[i]
    checks.push({ kind: 'media', key: item.key, ok: stored?.size === item.size && stored?.sha256 === item.sha256 })
  })
  return { ok: checks.every(check => check.ok), checks }
}
