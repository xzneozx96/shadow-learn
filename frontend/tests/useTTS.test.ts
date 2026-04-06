import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTTSCache, saveTTSCache } from '@/db'
import { getAppConfig } from '@/lib/config'
import { useTTS } from '../src/hooks/useTTS'

vi.mock('@/db', () => ({
  getTTSCache: vi.fn(),
  saveTTSCache: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock getAppConfig so the module-level promise cache doesn't leak between tests
vi.mock('@/lib/config', () => ({
  getAppConfig: vi.fn(),
  API_BASE: '',
}))

const mockDb = {} as any
const mockKeys = { openrouterApiKey: 'sk-test', minimaxApiKey: 'mm-test', azureSpeechKey: 'az-key', azureSpeechRegion: 'eastus' }

function mockProvider(provider: string) {
  vi.mocked(getAppConfig).mockResolvedValue({ ttsProvider: provider, sttProvider: 'deepgram', freeTrialAvailable: false })
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  globalThis.URL.revokeObjectURL = vi.fn()
  // jsdom's HTMLMediaElement.play() returns undefined; stub it to return a resolved Promise
  // so the hook's audio.play().catch(() => {}) doesn't throw a TypeError
})

describe('useTTS', () => {
  it('returns loadingText null initially', () => {
    mockProvider('azure')
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    expect(result.current.loadingText).toBeNull()
  })

  it('is a no-op while provider is still loading (null)', async () => {
    // Never resolve getAppConfig so providerRef stays null
    vi.mocked(getAppConfig).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(getTTSCache).not.toHaveBeenCalled()
  })

  it('defaults to azure when provider fetch fails', async () => {
    // getAppConfig falls back to azure internally on fetch failure — simulate that
    mockProvider('azure')
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await waitFor(() => expect(result.current.loadingText).toBeNull())

    // No error toast for the provider fetch failure
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('still calls the API when azure key is missing (backend uses system default)', async () => {
    mockProvider('azure')
    const keysWithoutAzure = { openrouterApiKey: 'sk-test' }
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() => useTTS(mockDb, keysWithoutAzure as any))
    await waitFor(() => {}) // let provider settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('still calls the API when minimax key is missing (backend uses system default)', async () => {
    mockProvider('minimax')
    const keysWithoutMinimax = { openrouterApiKey: 'sk-test' }
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() => useTTS(mockDb, keysWithoutMinimax as any))
    await waitFor(() => {}) // let provider settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('plays from cache without calling fetch for audio (azure provider)', async () => {
    mockProvider('azure')
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(getTTSCache).mockResolvedValueOnce(fakeBlob)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(getTTSCache).toHaveBeenCalledWith(mockDb, '你好', 'zh-CN')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(saveTTSCache).not.toHaveBeenCalled()
  })

  it('fetches from API with Azure keys on cache miss', async () => {
    mockProvider('azure')
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', source_language: 'zh-CN', azure_speech_key: 'az-key', azure_speech_region: 'eastus' }),
    }))
    expect(saveTTSCache).toHaveBeenCalledWith(mockDb, '你好', fakeBlob, 'zh-CN')
  })

  it('fetches from API with MiniMax key on cache miss', async () => {
    mockProvider('minimax')
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', source_language: 'zh-CN', minimax_api_key: 'mm-test' }),
    }))
  })

  it('is a no-op for empty text', async () => {
    mockProvider('azure')
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {})

    await act(async () => {
      await result.current.playTTS('')
    })

    expect(getTTSCache).not.toHaveBeenCalled()
  })
})
