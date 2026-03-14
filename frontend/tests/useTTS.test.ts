import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTTSCache, saveTTSCache } from '../src/db'
import { useTTS } from '../src/hooks/useTTS'

// Mock the db helpers
vi.mock('../src/db', () => ({
  getTTSCache: vi.fn(),
  saveTTSCache: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const mockDb = {} as any
const mockKeys = { openaiApiKey: 'sk-test', minimaxApiKey: 'mm-test' }

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
})

describe('useTTS', () => {
  it('returns loadingText null initially', () => {
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    expect(result.current.loadingText).toBeNull()
  })

  it('shows error toast when minimaxApiKey is missing', async () => {
    const keysWithoutMinimax = { openaiApiKey: 'sk-test' }
    const { result } = renderHook(() => useTTS(mockDb, keysWithoutMinimax as any))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Minimax'))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('plays from cache without calling fetch', async () => {
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(getTTSCache).mockResolvedValueOnce(fakeBlob)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(getTTSCache).toHaveBeenCalledWith(mockDb, '你好')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(saveTTSCache).not.toHaveBeenCalled()
  })

  it('fetches from API on cache miss and stores result', async () => {
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    } as any)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', minimax_api_key: 'mm-test' }),
    }))
    expect(saveTTSCache).toHaveBeenCalledWith(mockDb, '你好', fakeBlob)
  })

  it('shows error toast on API failure', async () => {
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Gateway',
    } as any)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalled()
  })

  it('is a no-op for empty text', async () => {
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('')
    })

    expect(getTTSCache).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
