import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePronunciationAssessment } from '@/hooks/usePronunciationAssessment'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ keys: { azureSpeechKey: 'az-key', azureSpeechRegion: 'eastus' } }),
}))

const mockBlob = new Blob(['audio'], { type: 'audio/webm' })
const mockResult = {
  overall: { accuracy: 85, fluency: 80, completeness: 90, prosody: 75 },
  words: [{ word: '你好', accuracy: 85, error_type: null }],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('usePronunciationAssessment', () => {
  it('starts with null result and no error', () => {
    const { result } = renderHook(() => usePronunciationAssessment())
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.submitting).toBe(false)
  })

  it('sets submitting=true while in flight and false after', async () => {
    let resolve!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise((res) => {
      resolve = res
    })))

    const { result } = renderHook(() => usePronunciationAssessment())
    act(() => {
      void result.current.submit(mockBlob, '你好')
    })
    expect(result.current.submitting).toBe(true)

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve(mockResult) })
    })
    expect(result.current.submitting).toBe(false)
  })

  it('sets result on successful submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => {
      await result.current.submit(mockBlob, '你好')
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.error).toBeNull()
  })

  it('sends correct FormData fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResult) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => {
      await result.current.submit(mockBlob, '你好吗')
    })

    const formData: FormData = mockFetch.mock.calls[0][1].body
    expect(formData.get('reference_text')).toBe('你好吗')
    expect(formData.get('language')).toBe('zh-CN')
    expect(formData.get('azure_key')).toBe('az-key')
    expect(formData.get('azure_region')).toBe('eastus')
    expect(formData.get('audio')).toBeInstanceOf(Blob)
  })

  it('sets error on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Azure quota exceeded'),
    }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => {
      await result.current.submit(mockBlob, '你好')
    })

    expect(result.current.error).toBe('Azure quota exceeded')
    expect(result.current.result).toBeNull()
  })

  it('reset() clears result and error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResult) }))

    const { result } = renderHook(() => usePronunciationAssessment())
    await act(async () => {
      await result.current.submit(mockBlob, '你好')
    })
    expect(result.current.result).not.toBeNull()

    act(() => {
      result.current.reset()
    })
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
