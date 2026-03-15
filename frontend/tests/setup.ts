import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView — stub it to avoid TypeError in components that call it
window.HTMLElement.prototype.scrollIntoView = function () {}

// jsdom's structuredClone does not properly handle Blob objects (loses .type and content).
// Patch it to use Node's native implementation which correctly clones Blobs via structured clone.
const nativeStructuredClone = globalThis.structuredClone
globalThis.structuredClone = function patchedStructuredClone<T>(value: T, options?: StructuredSerializeOptions): T {
  if (value instanceof Blob) {
    // Blobs are immutable — pass through as-is. jsdom's structuredClone loses .type;
    // fake-indexeddb clones stored values, so without this patch all Blobs read back with type=''.
    return value as T
  }
  return nativeStructuredClone(value, options)
}
