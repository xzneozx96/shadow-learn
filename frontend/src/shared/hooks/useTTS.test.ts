import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTTSCache, saveTTSCache } from '@/db'
import { useTTS } from '@/shared/hooks/useTTS'

vi.mock('@/db', () => ({
  getTTSCache: vi.fn(),
  saveTTSCache: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/shared/lib/config', () => ({
  API_BASE: '',
}))

const mockDb = {} as any

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
    const { result } = renderHook(() => useTTS(mockDb))
    expect(result.current.loadingText).toBeNull()
  })

  it('plays from cache without calling fetch for audio', async () => {
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(getTTSCache).mockResolvedValueOnce(fakeBlob)

    const { result } = renderHook(() => useTTS(mockDb))
    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(getTTSCache).toHaveBeenCalledWith(mockDb, '你好', 'zh-CN')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(saveTTSCache).not.toHaveBeenCalled()
  })

  it('fetches from API without any provider key field on cache miss', async () => {
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() => useTTS(mockDb))
    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', source_language: 'zh-CN' }),
    }))
    expect(saveTTSCache).toHaveBeenCalledWith(mockDb, '你好', fakeBlob, 'zh-CN')
  })

  it('sends minimax_voice_id in POST body when voiceId is provided', async () => {
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(fakeBlob) } as any)

    const { result } = renderHook(() =>
      useTTS(mockDb, 'zh-CN', 'Chinese (Mandarin)_Crisp_Girl'),
    )
    await act(async () => {
      await result.current.playTTS('你好')
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.minimax_voice_id).toBe('Chinese (Mandarin)_Crisp_Girl')
  })

  it('shows the server detail when the backend rejects the call', async () => {
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ detail: 'Too many requests. Try again in 12 seconds.' }),
      { status: 429, headers: { 'Retry-After': '12' } },
    ))

    const { result } = renderHook(() => useTTS(mockDb))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalledWith('Too many requests. Try again in 12 seconds.')
  })

  it('is a no-op for empty text', async () => {
    const { result } = renderHook(() => useTTS(mockDb))
    await act(async () => {
      await result.current.playTTS('')
    })

    expect(getTTSCache).not.toHaveBeenCalled()
  })
})
