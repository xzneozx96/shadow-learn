/**
 * Integration tests for image attachment wiring in CompanionChatArea.
 * Tests the attach button presence, file validation toasts, send payload, and send-guard behaviour.
 *
 * NOTE: @testing-library/user-event respects the `accept` attribute on file inputs
 * and silently drops non-matching files (simulating browser behaviour). For tests
 * that verify rejection toast messages we therefore use `fireEvent` + manual
 * `Object.defineProperty` to bypass the browser-level filter and confirm that
 * PromptInput's own validation layer fires the correct `onError` callback.
 */

import type { FileUIPart } from 'ai'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionChatArea } from '@/components/chat/CompanionChatArea'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// Capture toast calls
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: any[]) => mockToastError(...args) },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024

function makeFile(name: string, type: string, size: number): File {
  const buf = new Uint8Array(size)
  return new File([buf], name, { type })
}

function makeDefaultProps(overrides: Partial<Parameters<typeof CompanionChatArea>[0]> = {}) {
  return {
    messages: [],
    isLoading: false,
    hasMore: false,
    onLoadMore: vi.fn(),
    chips: [],
    onRemoveChip: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  }
}

/**
 * Simulate a file being selected in the hidden file input, bypassing the browser-
 * level `accept` filter so that PromptInput's own validation (matchesAccept /
 * maxFileSize) is exercised directly.
 *
 * The fake FileList must be iterable (spread-compatible) since PromptInput does
 * `const incoming = [...fileList]` in its change handler.
 */
function simulateFileSelection(fileInput: HTMLInputElement, file: File) {
  const fakeFileList = {
    0: file,
    length: 1,
    item: (i: number) => (i === 0 ? file : null),
    * [Symbol.iterator]() { yield file },
  }
  Object.defineProperty(fileInput, 'files', {
    configurable: true,
    get: () => fakeFileList as unknown as FileList,
  })
  fireEvent.change(fileInput)
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as any
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('companionChatArea — image attachment', () => {
  it('renders an attach/upload button', () => {
    render(<CompanionChatArea {...makeDefaultProps()} />)
    const btn = screen.queryByRole('button', { name: /attach image/i })
      ?? screen.queryByLabelText(/attach image/i)
    expect(btn).not.toBeNull()
  })

  it('calls onSend with files when a valid PNG is attached and form is submitted', async () => {
    const onSend = vi.fn()
    render(<CompanionChatArea {...makeDefaultProps({ onSend })} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    // Upload a valid PNG via userEvent (respects accept, so this should succeed)
    const png = makeFile('test.png', 'image/png', 1 * MB)
    await userEvent.upload(fileInput, png)

    // Type some text and click the submit button
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'Here is an image')
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledOnce()
    })

    const payload = onSend.mock.calls[0][0] as { text: string, files?: FileUIPart[] }
    expect(payload.files).toHaveLength(1)
    expect(payload.files![0].mediaType).toBe('image/png')
  })

  it('shows a toast error when a GIF is attached', () => {
    render(<CompanionChatArea {...makeDefaultProps()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    // Bypass browser accept filter to test PromptInput's own validation
    simulateFileSelection(fileInput, makeFile('anim.gif', 'image/gif', 1 * MB))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/JPG|PNG|WEBP/i),
    )
  })

  it('shows a toast error when a file over 5 MB is attached', () => {
    render(<CompanionChatArea {...makeDefaultProps()} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    // A 6 MB PNG — passes the accept check but fails the size check
    simulateFileSelection(fileInput, makeFile('big.png', 'image/png', 6 * MB))

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/5\s*MB/i),
    )
  })

  it('enables send button and calls onSend when image is attached with no text', async () => {
    const onSend = vi.fn()
    render(<CompanionChatArea {...makeDefaultProps({ onSend })} />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const png = makeFile('photo.png', 'image/png', 1 * MB)
    await userEvent.upload(fileInput, png)

    // Click submit without typing any text
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledOnce()
    })

    const payload = onSend.mock.calls[0][0] as { text: string, files?: FileUIPart[] }
    expect(payload.files).toHaveLength(1)
  })

  it('calls onSend with text and no files when only text is typed (no regression)', async () => {
    const onSend = vi.fn()
    render(<CompanionChatArea {...makeDefaultProps({ onSend })} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'Hello world')
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledOnce()
    })

    const payload = onSend.mock.calls[0][0] as { text: string, files?: FileUIPart[] }
    expect(payload.text).toBe('Hello world')
    expect(!payload.files || payload.files.length === 0).toBe(true)
  })
})
