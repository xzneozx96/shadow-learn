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
