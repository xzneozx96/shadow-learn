// jsdom's structuredClone loses Blob content, and fake-indexeddb clones every stored value.
// Legacy video and shadowing-audio rows hold Blobs, top-level or nested, as browsers allow.
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
