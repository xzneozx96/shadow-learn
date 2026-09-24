// tests/setup.ts passes top-level Blobs through structuredClone for fake-indexeddb.
// Legacy shadowing-audio rows nest the Blob inside an object, as browsers allow.
const clone = globalThis.structuredClone

function keepBlobs(value: unknown): unknown {
  if (value instanceof Blob)
    return value
  if (Array.isArray(value))
    return value.map(keepBlobs)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, keepBlobs(item)]))
  return clone(value)
}

globalThis.structuredClone = keepBlobs as typeof structuredClone
