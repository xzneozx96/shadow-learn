import { createSHA256 } from 'hash-wasm'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface JsonObject { [key: string]: Json }

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Postgres rejects NUL and lone surrogates in text and JSONB, so they never leave the device. */
export function storableText(text: string): string {
  return text.replaceAll('\0', '').replace(LONE_SURROGATE, '\uFFFD')
}

function storable(value: Json): Json {
  if (typeof value === 'string')
    return storableText(value)
  if (Array.isArray(value))
    return value.map(storable)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [storableText(key), storable(item)]))
  return value
}

export function toJson(value: unknown): Json {
  return storable(JSON.parse(JSON.stringify(value) ?? 'null'))
}

export function canonical(value: Json): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

const utf8 = new TextEncoder()

function compareUtf8(a: string, b: string): number {
  const left = utf8.encode(a)
  const right = utf8.encode(b)
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i])
      return left[i] - right[i]
  }
  return left.length - right.length
}

export interface Digest {
  count: number
  sha256: string
}

export async function storeDigest(records: Iterable<[id: string, value: Json]>): Promise<Digest> {
  const sorted = [...records].sort(([a], [b]) => compareUtf8(a, b))
  const sha = await createSHA256()
  for (const [, value] of sorted)
    sha.update(`${canonical(value)}\n`)
  return { count: sorted.length, sha256: sha.digest('hex') }
}

const BLOB_SLICE_BYTES = 8 * 1024 * 1024

export async function blobDigest(blob: Blob): Promise<{ size: number, sha256: string }> {
  const sha = await createSHA256()
  for (let offset = 0; offset < blob.size; offset += BLOB_SLICE_BYTES)
    sha.update(new Uint8Array(await blob.slice(offset, offset + BLOB_SLICE_BYTES).arrayBuffer()))
  return { size: blob.size, sha256: sha.digest('hex') }
}
