import type { LegacySnapshot, Skipped } from './exportStores'
import type { Verification } from './manifest'
import type { ApiClient } from '@/db'
import type { ShadowLearnDB } from '@/db/legacy'
import type { DecryptedKeys } from '@/shared/types'
import { useCallback, useReducer, useRef } from 'react'
import { decryptKeys } from '@/shared/lib/crypto'
import { canonical, toJson } from './canonical'
import { deleteLegacyDatabase, openLegacy } from './detectLegacyData'
import { claimImport, readSnapshot, RECORD_STORES } from './exportStores'
import { emptyLedger, verify } from './manifest'
import { uploadMedia } from './uploadMedia'
import { uploadLessons, uploadStore } from './uploadRecords'

export type KeysOutcome
  = | { kind: 'none' }
    | { kind: 'skipped' }
    | { kind: 'saved', failed: string[], kept: string[] }

export interface Notes {
  keys: KeysOutcome
  keptAccountCopy: number
  quarantined: number
  skipped: Skipped
}

export type Phase
  = | { step: 'explain', busy: boolean }
    | { step: 'keys', busy: boolean, wrongPin: number, confirmSkip: boolean }
    | { step: 'records', done: number, total: number }
    | { step: 'media', done: number, total: number }
    | { step: 'verify', records: number, media: number }
    | { step: 'failed', verification: Verification }
    | { step: 'delete', blocked: boolean }
    | { step: 'done', verification: Verification, notes: Notes }
    | { step: 'other-account' }
    | { step: 'error', message: string }

type Event
  = | { type: 'loading' }
    | { type: 'ask-pin' }
    | { type: 'pin-checking' }
    | { type: 'pin-wrong' }
    | { type: 'confirm-skip', open: boolean }
    | { type: 'records', total: number }
    | { type: 'media', total: number }
    | { type: 'sent', count: number }
    | { type: 'verify', records: number, media: number }
    | { type: 'mismatch', verification: Verification }
    | { type: 'delete' }
    | { type: 'blocked' }
    | { type: 'done', verification: Verification, notes: Notes }
    | { type: 'other-account' }
    | { type: 'error', message: string }

export function reduce(phase: Phase, event: Event): Phase {
  switch (event.type) {
    case 'loading':
      return phase.step === 'explain' ? { step: 'explain', busy: true } : phase
    case 'ask-pin':
      return { step: 'keys', busy: false, wrongPin: 0, confirmSkip: false }
    case 'pin-checking':
      return phase.step === 'keys' ? { ...phase, busy: true } : phase
    case 'pin-wrong':
      return phase.step === 'keys' ? { ...phase, busy: false, wrongPin: phase.wrongPin + 1 } : phase
    case 'confirm-skip':
      return phase.step === 'keys' ? { ...phase, confirmSkip: event.open } : phase
    case 'records':
      return { step: 'records', done: 0, total: event.total }
    case 'media':
      return { step: 'media', done: 0, total: event.total }
    case 'sent':
      return phase.step === 'records' || phase.step === 'media'
        ? { ...phase, done: Math.min(phase.total, phase.done + event.count) }
        : phase
    case 'verify':
      return { step: 'verify', records: event.records, media: event.media }
    case 'mismatch':
      return { step: 'failed', verification: event.verification }
    case 'delete':
      return { step: 'delete', blocked: false }
    case 'blocked':
      return phase.step === 'delete' ? { step: 'delete', blocked: true } : phase
    case 'done':
      return { step: 'done', verification: event.verification, notes: event.notes }
    case 'other-account':
      return { step: 'other-account' }
    case 'error':
      return { step: 'error', message: event.message }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

type Provider = 'openrouter' | 'azure_speech' | 'google'

const PROVIDER_NAMES: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  azure_speech: 'Azure Speech',
  google: 'Google',
}

function keyUpdates(keys: DecryptedKeys): [Provider, { value: string, region?: string }][] {
  const updates: [Provider, { value: string, region?: string }][] = []
  if (keys.openrouterApiKey)
    updates.push(['openrouter', { value: keys.openrouterApiKey }])
  if (keys.azureSpeechKey)
    updates.push(['azure_speech', { value: keys.azureSpeechKey, region: keys.azureSpeechRegion }])
  if (keys.googleRealtimeKey)
    updates.push(['google', { value: keys.googleRealtimeKey }])
  return updates
}

async function saveKeys(api: ApiClient, keys: DecryptedKeys): Promise<{ failed: string[], kept: string[] }> {
  const account = await api.list<{ provider: Provider, source: string }>('/api/keys')
  const own = new Set(account.filter(state => state.source === 'user').map(state => state.provider))
  const failed: string[] = []
  const kept: string[] = []
  for (const [provider, body] of keyUpdates(keys)) {
    if (own.has(provider)) {
      kept.push(PROVIDER_NAMES[provider])
      continue
    }
    const res = await api.fetch(`/api/keys/${provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 422)
      failed.push(PROVIDER_NAMES[provider])
    else if (!res.ok)
      throw new Error(`Saving your ${PROVIDER_NAMES[provider]} key failed: ${res.status}`)
  }
  return { failed, kept }
}

function withImportLock(run: () => Promise<void>): Promise<void> {
  if (!navigator.locks)
    return run()
  return navigator.locks.request('shadowlearn-import', run)
}

export function recordTotal(snapshot: LegacySnapshot): number {
  return snapshot.lessons.length + snapshot.stores.reduce((sum, { records }) => sum + records.length, 0)
}

function fingerprint(snapshot: LegacySnapshot): string {
  const media = snapshot.media.map(({ key, blob }) => ({ key, size: blob.size }))
  return canonical(toJson({ lessons: snapshot.lessons, stores: snapshot.stores, media }))
}

const MAX_ROUNDS = 3

interface Loaded {
  db: ShadowLearnDB
  snapshot: LegacySnapshot
  source: string
}

type Dispatch = (event: Event) => void

async function importSnapshot(api: ApiClient, source: string, snapshot: LegacySnapshot, dispatch: Dispatch) {
  const ledger = emptyLedger(source, ['lessons', 'segments', ...RECORD_STORES])
  const sent = (count: number) => dispatch({ type: 'sent', count })

  dispatch({ type: 'records', total: recordTotal(snapshot) })
  await uploadLessons(api, ledger, snapshot.lessons, sent)
  let keptAccountCopy = 0
  for (const { store, records } of snapshot.stores)
    keptAccountCopy += (await uploadStore(api, ledger, store, records, sent)).keptAccountCopy

  const setAside = new Set([...ledger.quarantine.values()].filter(record => record.store === 'lessons').map(record => record.recordId))
  const media = snapshot.media.filter(item => !setAside.has(item.key.lessonId))
  ledger.unsentMedia = snapshot.media.filter(item => setAside.has(item.key.lessonId)).map(item => item.key)
  dispatch({ type: 'media', total: media.length })
  await uploadMedia(api, ledger, media, sent)

  dispatch({ type: 'verify', records: recordTotal(snapshot), media: media.length })
  return { verification: await verify(api, ledger), keptAccountCopy, quarantined: ledger.quarantine.size }
}

export function useMigration(api: ApiClient, account: string) {
  const [phase, dispatch] = useReducer(reduce, { step: 'explain', busy: false })
  const loadedRef = useRef<Loaded | null>(null)
  const keysRef = useRef<{ outcome: KeysOutcome, decrypted: DecryptedKeys | null }>({ outcome: { kind: 'none' }, decrypted: null })

  const run = useCallback(() => withImportLock(async () => {
    const loaded = loadedRef.current
    if (!loaded)
      return
    try {
      if (keysRef.current.decrypted)
        keysRef.current.outcome = { kind: 'saved', ...(await saveKeys(api, keysRef.current.decrypted)) }

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const { verification, keptAccountCopy, quarantined } = await importSnapshot(api, loaded.source, loaded.snapshot, dispatch)
        if (!verification.ok) {
          dispatch({ type: 'mismatch', verification })
          return
        }
        const fresh = await readSnapshot(loaded.db, account)
        if (fingerprint(fresh) !== fingerprint(loaded.snapshot)) {
          loaded.snapshot = fresh
          continue
        }

        dispatch({ type: 'delete' })
        loaded.db.close()
        await deleteLegacyDatabase(() => dispatch({ type: 'blocked' }))
        loadedRef.current = null
        dispatch({ type: 'done', verification, notes: { keys: keysRef.current.outcome, keptAccountCopy, quarantined, skipped: loaded.snapshot.skipped } })
        return
      }
      dispatch({ type: 'error', message: 'The data in this browser kept changing during the move. Close other ShadowLearn tabs and retry.' })
    }
    catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }), [account, api])

  const start = useCallback(async () => {
    dispatch({ type: 'loading' })
    try {
      if (!loadedRef.current) {
        const db = await openLegacy()
        const claim = await claimImport(db, account)
        if (claim.account !== account) {
          db.close()
          dispatch({ type: 'other-account' })
          return
        }
        loadedRef.current = { db, snapshot: await readSnapshot(db, account), source: claim.source }
      }
    }
    catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      return
    }
    if (loadedRef.current.snapshot.keys && keysRef.current.outcome.kind === 'none' && !keysRef.current.decrypted)
      dispatch({ type: 'ask-pin' })
    else
      await run()
  }, [account, run])

  const submitPin = useCallback(async (pin: string) => {
    const encrypted = loadedRef.current?.snapshot.keys
    if (!encrypted)
      return
    dispatch({ type: 'pin-checking' })
    try {
      keysRef.current.decrypted = await decryptKeys(encrypted, pin)
    }
    catch {
      dispatch({ type: 'pin-wrong' })
      return
    }
    await run()
  }, [run])

  const skipKeys = useCallback(async () => {
    keysRef.current.outcome = { kind: 'skipped' }
    await run()
  }, [run])

  const confirmSkip = useCallback((open: boolean) => dispatch({ type: 'confirm-skip', open }), [])

  const retry = useCallback(() => (loadedRef.current ? run() : start()), [run, start])

  return { phase, start, submitPin, skipKeys, confirmSkip, retry }
}
