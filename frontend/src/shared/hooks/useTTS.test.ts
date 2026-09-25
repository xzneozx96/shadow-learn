import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTTS } from '@/shared/hooks/useTTS'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/shared/lib/config', () => ({
  API_BASE: '',
}))

function audioResponse(): Response {
  return { ok: true, blob: () => Promise.resolve(new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })) } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn(async () => audioResponse())
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('useTTS', () => {
  it('returns loadingText null initially', () => {
    const { result } = renderHook(() => useTTS())
    expect(result.current.loadingText).toBeNull()
  })

  it('posts to /api/tts on every play, with no local cache in between', async () => {
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.playTTS('你好')
    })
    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    for (const [url, init] of vi.mocked(globalThis.fetch).mock.calls) {
      expect(url).toBe('/api/tts')
      expect(init).toEqual(expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: '你好', source_language: 'zh-CN' }),
      }))
    }
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('sends the language and minimax_voice_id when a voice is provided', async () => {
    const { result } = renderHook(() => useTTS('ja', 'Chinese (Mandarin)_Crisp_Girl'))
    await act(async () => {
      await result.current.playTTS('こんにちは')
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    const body = JSON.parse((options as RequestInit).body as string)
    expect(body).toEqual({ text: 'こんにちは', source_language: 'ja', minimax_voice_id: 'Chinese (Mandarin)_Crisp_Girl' })
  })

  it('shows the server detail when the backend rejects the call', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ detail: 'Too many requests. Try again in 12 seconds.' }),
      { status: 429, headers: { 'Retry-After': '12' } },
    ))

    const { result } = renderHook(() => useTTS())

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalledWith('Too many requests. Try again in 12 seconds.')
  })

  it('is a no-op for empty text', async () => {
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.playTTS('')
    })

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
