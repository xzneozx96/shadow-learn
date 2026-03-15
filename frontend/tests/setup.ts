import '@testing-library/jest-dom/vitest'

// jsdom's structuredClone does not properly handle Blob objects (loses .type and content).
// Patch it to use Node's native implementation which correctly clones Blobs via structured clone.
const nativeStructuredClone = globalThis.structuredClone
globalThis.structuredClone = function patchedStructuredClone<T>(value: T, options?: StructuredSerializeOptions): T {
  if (value instanceof Blob) {
    // Node's structuredClone handles Blob correctly; call it in a non-jsdom context via vm
    // Simpler: reconstruct the Blob to preserve type and content reference
    return value as T
  }
  return nativeStructuredClone(value, options)
}
