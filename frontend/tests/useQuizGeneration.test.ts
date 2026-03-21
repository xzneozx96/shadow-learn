import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizGeneration } from '@/hooks/useQuizGeneration'

// Mock useAuth so hook can be tested without AuthContext provider
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ keys: { openrouterApiKey: 'sk-test' } }),
}))

const mockPool = [
  { word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: 'greeting', sourceSegmentId: 's1', sourceSegmentText: '', sourceLessonTitle: '', sourceLessonId: '', id: '1', sourceLanguage: 'zh-CN', sourceSegmentTranslation: '', createdAt: '' },
  { word: '再见', romanization: 'zài jiàn', meaning: 'goodbye', usage: 'farewell', sourceSegmentId: 's1', sourceSegmentText: '', sourceLessonTitle: '', sourceLessonId: '', id: '2', sourceLanguage: 'zh-CN', sourceSegmentTranslation: '', createdAt: '' },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useQuizGeneration', () => {
  it('returns loading=false initially', () => {
    const { result } = renderHook(() => useQuizGeneration())
    expect(result.current.loading).toBe(false)
  })

  it('sets loading=true while in flight and false after', async () => {
    let resolveFirst!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: [] }) }))

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    let promise!: Promise<any>
    act(() => {
      promise = result.current.generateQuiz(['cloze', 'pronunciation'], mockPool, controller.signal)
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveFirst({ ok: true, json: () => Promise.resolve({ exercises: [] }) })
      await promise
    })
    expect(result.current.loading).toBe(false)
  })

  it('returns clozeExercises and pronExercises from API', async () => {
    const clozeResult = [{ story: 'I said __', blanks: ['你好'] }]
    const pronResult = [{ sentence: '你好吗', translation: 'How are you?' }]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: clozeResult }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: pronResult }) }))

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    let data: any
    await act(async () => {
      data = await result.current.generateQuiz(['cloze', 'pronunciation'], mockPool, controller.signal)
    })

    expect(data.clozeExercises).toEqual(clozeResult)
    expect(data.pronExercises).toEqual(pronResult)
  })

  it('skips cloze call when no cloze types in distribution', async () => {
    const pronResult = [{ sentence: '你好吗', translation: 'How are you?' }]
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: pronResult }) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await result.current.generateQuiz(['pronunciation'], mockPool, controller.signal)
    })

    // Only 1 fetch call — pronunciation only
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][1].body).toContain('pronunciation_sentence')
  })

  it('throws when API returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await expect(
        result.current.generateQuiz(['cloze'], mockPool, controller.signal),
      ).rejects.toThrow('Quiz generation failed (500)')
    })
  })

  it('sends words as { word, romanization, meaning, usage } and uses story_count for cloze', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: [] }) })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useQuizGeneration())
    const controller = new AbortController()

    await act(async () => {
      await result.current.generateQuiz(['cloze'], mockPool, controller.signal)
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      exercise_type: 'cloze',
      story_count: 1,
      words: expect.arrayContaining([
        expect.objectContaining({ word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: 'greeting' }),
      ]),
    })
    // No extra fields like sourceSegmentId
    expect(body.words[0]).not.toHaveProperty('sourceSegmentId')
  })
})
