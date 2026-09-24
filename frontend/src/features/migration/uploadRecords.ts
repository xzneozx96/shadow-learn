import type { Json, JsonObject } from './canonical'
import type { OutgoingLesson, OutgoingRecord, RecordStore } from './exportStores'
import type { Ledger, QuarantinedRecord } from './manifest'
import type { ApiClient } from '@/db'
import { responseError } from '@/shared/lib/api'
import { toJson } from './canonical'
import { recordId } from './exportStores'
import { quarantineKey, storeLedger } from './manifest'

export const MAX_BATCH_RECORDS = 500
export const MAX_BATCH_BYTES = 1_000_000

export function batches<T>(items: T[], size: (item: T) => number): T[][] {
  const out: T[][] = []
  let current: T[] = []
  let bytes = 0
  for (const item of items) {
    const itemBytes = size(item)
    if (current.length > 0 && (current.length >= MAX_BATCH_RECORDS || bytes + itemBytes > MAX_BATCH_BYTES)) {
      out.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += itemBytes
  }
  if (current.length > 0)
    out.push(current)
  return out
}

const utf8 = new TextEncoder()
const jsonBytes = (value: unknown) => utf8.encode(JSON.stringify(value)).length

interface ValidationDetail {
  loc: (string | number)[]
  msg: string
}

function isValidationDetail(value: unknown): value is ValidationDetail {
  return typeof value === 'object' && value !== null
    && Array.isArray((value as { loc?: unknown }).loc)
    && typeof (value as { msg?: unknown }).msg === 'string'
}

async function rejectedItems(res: Response, listField: string): Promise<Map<number, Json[]> | null> {
  const body: unknown = await res.clone().json().catch(() => null)
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : null
  if (!Array.isArray(detail))
    return null
  const rejected = new Map<number, Json[]>()
  for (const item of detail.filter(isValidationDetail)) {
    const [where, field, position, ...path] = item.loc
    if (where !== 'body' || field !== listField || typeof position !== 'number')
      return null
    rejected.set(position, [...(rejected.get(position) ?? []), toJson({ ...item, loc: [where, field, position, ...path] })])
  }
  return rejected.size > 0 ? rejected : null
}

async function postJson(api: ApiClient, path: string, body: unknown): Promise<Response> {
  return api.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function quarantine(api: ApiClient, ledger: Ledger, records: QuarantinedRecord[]): Promise<void> {
  if (records.length === 0)
    return
  const res = await postJson(api, '/api/import/quarantine', { source: ledger.source, records })
  if (!res.ok)
    throw await responseError(res, `Keeping rejected records failed: ${res.status}`)
  for (const record of records)
    ledger.quarantine.set(quarantineKey(record), record)
}

async function sendBatch<T>(
  api: ApiClient,
  ledger: Ledger,
  items: T[],
  request: { path: string, listField: string, body: (items: T[]) => unknown },
  toQuarantine: (item: T, error: Json[]) => QuarantinedRecord,
): Promise<{ accepted: T[], body: unknown }> {
  let pending = items
  while (pending.length > 0) {
    const res = await postJson(api, request.path, request.body(pending))
    if (res.ok)
      return { accepted: pending, body: await res.json() }
    const rejected = res.status === 422 ? await rejectedItems(res, request.listField) : null
    if (!rejected)
      throw await responseError(res, `${request.path} failed: ${res.status}`)
    await quarantine(api, ledger, pending.flatMap((item, i) => {
      const detail = rejected.get(i)
      return detail === undefined ? [] : [toQuarantine(item, detail)]
    }))
    pending = pending.filter((_, i) => !rejected.has(i))
  }
  return { accepted: [], body: null }
}

export async function uploadLessons(
  api: ApiClient,
  ledger: Ledger,
  lessons: OutgoingLesson[],
  onProgress: (sent: number) => void,
): Promise<void> {
  const lessonLedger = storeLedger(ledger, 'lessons')
  const segmentLedger = storeLedger(ledger, 'segments')
  for (const batch of batches(lessons, lesson => jsonBytes(lesson))) {
    const { accepted, body } = await sendBatch(
      api,
      ledger,
      batch,
      { path: '/api/import/lessons', listField: 'lessons', body: items => ({ source: ledger.source, lessons: items.map(item => ({ ...item.lesson, segments: item.segments })) }) },
      (item, error) => ({ store: 'lessons', recordId: item.id, raw: { ...item.lesson, segments: item.segments }, error }),
    )
    const outcomes = outcomesOf(body)
    for (const lesson of accepted) {
      const outcome = outcomes.get(lesson.id)
      if (outcome === 'stored') {
        lessonLedger.expected.set(lesson.id, lesson.lesson)
        segmentLedger.expected.set(lesson.id, lesson.segments)
      }
      else if (outcome === 'kept_server') {
        lessonLedger.present.add(lesson.id)
        segmentLedger.present.add(lesson.id)
      }
      else if (outcome === 'conflict') {
        lessonLedger.conflicts.push(lesson.id)
      }
      else {
        lessonLedger.missing.push(lesson.id)
      }
    }
    onProgress(batch.length)
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function afterRecords(body: unknown): JsonObject[] {
  const after = isObject(body) ? body.after : null
  return Array.isArray(after) ? after.filter(isObject) : []
}

type Outcome = 'stored' | 'merged' | 'kept_server' | 'conflict'
const OUTCOMES = new Set<Json>(['stored', 'merged', 'kept_server', 'conflict'])

function outcomesOf(body: unknown): Map<string, Outcome> {
  const outcomes = isObject(body) && isObject(body.outcomes) ? body.outcomes : {}
  return new Map(Object.entries(outcomes).filter((entry): entry is [string, Outcome] => OUTCOMES.has(entry[1])))
}

/**
 * The account may already hold a material with the same unique externalId under
 * another id. The server keeps that copy, so the device's duplicate is not sent.
 */
async function withoutAccountDuplicates(api: ApiClient, records: OutgoingRecord[]): Promise<{ records: OutgoingRecord[], kept: number }> {
  if (records.length === 0)
    return { records, kept: 0 }
  const server = await api.list<JsonObject>('/api/store/user-materials')
  const owner = new Map(server.map(material => [material.externalId, material.id]))
  const unique = records.filter(({ id, data }) => !owner.has(data.externalId ?? null) || owner.get(data.externalId ?? null) === id)
  return { records: unique, kept: records.length - unique.length }
}

export async function uploadStore(
  api: ApiClient,
  ledger: Ledger,
  store: RecordStore,
  records: OutgoingRecord[],
  onProgress: (sent: number) => void,
): Promise<{ keptAccountCopy: number }> {
  const entry = storeLedger(ledger, store)
  const { records: sendable, kept } = store === 'user-materials'
    ? await withoutAccountDuplicates(api, records)
    : { records, kept: 0 }
  onProgress(records.length - sendable.length)
  for (const batch of batches(sendable, record => jsonBytes(record.data))) {
    const { accepted, body } = await sendBatch(
      api,
      ledger,
      batch,
      { path: `/api/store/${store}/bulk`, listField: 'records', body: items => ({ mode: 'import', source: ledger.source, records: items.map(item => item.data) }) },
      (item, error) => ({ store, recordId: item.id, raw: item.data, error }),
    )
    const after = new Map(afterRecords(body).map(record => [recordId(store, record), record]))
    const outcomes = outcomesOf(body)
    for (const { id, data } of accepted) {
      const outcome = outcomes.get(id)
      const merged = after.get(id)
      if (outcome === 'stored') {
        entry.expected.set(id, data)
      }
      else if (outcome === 'kept_server') {
        entry.present.add(id)
      }
      else if (outcome === 'merged' && merged !== undefined) {
        entry.expected.set(id, merged)
        entry.dominance.set(id, data)
      }
      else if (outcome === 'conflict') {
        entry.conflicts.push(id)
      }
      else {
        entry.missing.push(id)
      }
    }
    onProgress(batch.length)
  }
  return { keptAccountCopy: kept }
}
