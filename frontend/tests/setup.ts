import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView — stub it to avoid TypeError in components that call it
window.HTMLElement.prototype.scrollIntoView = function () {}

// jsdom's FileReader.readAsDataURL fails with a cross-realm Blob identity error because
// the Blob returned by fetch(blobUrl).blob() isn't recognised as a Blob by jsdom's IDL
// validator. Override createObjectURL to return a data: URL so PromptInput skips the
// blob-to-dataUrl conversion path entirely during tests.
globalThis.URL.createObjectURL = (_blob: Blob) => 'data:image/png;base64,fake'
globalThis.URL.revokeObjectURL = () => {}

// jsdom does not implement ResizeObserver.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any

// jsdom does not implement the Web Animations API (Element.getAnimations).
// @base-ui/react's ScrollArea calls viewport.getAnimations() inside a timeout,
// which throws an unhandled error in the test runner.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}

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
