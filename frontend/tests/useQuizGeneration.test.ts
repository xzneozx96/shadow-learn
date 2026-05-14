import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizGeneration } from '@/hooks/useQuizGeneration'

const mockGetSegments = vi.fn()

vi.mock('@/db', () => ({
  getSegments: (...args: any[]) => mockGetSegments(...args),
}))

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ locale: 'en' }),
}))

const mockDb = {} as any
let mockAuth: any = { keys: { openrouterApiKey: 'sk-test' }, db: mockDb }

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const mockSegments = [
  {
    id: 'seg-1',
    start: 0,
    end: 2,
    text: '你好，世界',
    romanization: 'nǐ hǎo shì jiè',
    translations: { en: 'Hello, world', vi: 'Xin chào, thế giới' },
    words: [],
  },
  {
    id: 'seg-2',
    start: 2,
    end: 4,
    text: '再见，朋友',
    romanization: 'zài jiàn péng yǒu',
    translations: { en: 'Goodbye, friend', vi: 'Tạm biệt, bạn bè' },
    words: [],
  },
]

const mockPool = [
  {
    id: '1',
    word: '你好',
    romanization: 'nǐ hǎo',
    meaning: 'hello',
    usage: 'greeting',
    sourceLessonId: 'lesson-a',
    sourceLessonTitle: 'Lesson A',
    sourceSegmentId: 'seg-1',
    sourceSegmentText: '你好，世界',
    sourceSegmentTranslation: 'Hello, world',
    sourceLanguage: 'zh-CN',
    createdAt: '',
  },
  {
    id: '2',
    word: '再见',
    romanization: 'zài jiàn',
    meaning: 'goodbye',
    usage: 'farewell',
    sourceLessonId: 'lesson-a',
    sourceLessonTitle: 'Lesson A',
    sourceSegmentId: 'seg-2',
    sourceSegmentText: '再见，朋友',
    sourceSegmentTranslation: 'Goodbye, friend',
    sourceLanguage: 'zh-CN',
    createdAt: '',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth = { keys: { openrouterApiKey: 'sk-test' }, db: mockDb }
  mockGetSegments.mockResolvedValue(mockSegments)
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

  describe('translation sentences from IDB', () => {
    it('does not call fetch for translation type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ exercises: [] }) })
      vi.stubGlobal('fetch', mockFetch)

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      await act(async () => {
        await result.current.generateQuiz(['translation'], mockPool, controller.signal)
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('calls getSegments once for single-lesson pool', async () => {
      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      await act(async () => {
        await result.current.generateQuiz(['translation'], mockPool, controller.signal)
      })

      expect(mockGetSegments).toHaveBeenCalledOnce()
      expect(mockGetSegments).toHaveBeenCalledWith(mockDb, 'lesson-a')
    })

    it('builds translationSentences from segment data using current locale', async () => {
      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation', 'translation'], mockPool, controller.signal)
      })

      expect(data.translationSentences).toHaveLength(2)
      expect(data.translationSentences[0]).toEqual({
        text: '你好，世界',
        romanization: 'nǐ hǎo shì jiè',
        translation: 'Hello, world', // en locale (default in test mock via useI18n)
      })
      expect(data.translationSentences[1]).toEqual({
        text: '再见，朋友',
        romanization: 'zài jiàn péng yǒu',
        translation: 'Goodbye, friend',
      })
    })

    it('uses seg.text not entry.sourceSegmentText so all three fields come from same segment', async () => {
      // Simulate stale vocab entry: sourceSegmentText diverged from actual segment text
      const stalePool = [{
        ...mockPool[0],
        sourceSegmentText: '旧的文字', // stale cached text on vocab entry
        sourceSegmentId: 'seg-1', // but ID still points to seg-1
      }]

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation'], stalePool, controller.signal)
      })

      // Must use seg.text, not the stale entry.sourceSegmentText
      expect(data.translationSentences[0].text).toBe('你好，世界')
      expect(data.translationSentences[0].romanization).toBe('nǐ hǎo shì jiè')
      expect(data.translationSentences[0].translation).toBe('Hello, world')
    })

    it('falls back to entry.sourceSegmentTranslation when segment not in IDB', async () => {
      mockGetSegments.mockResolvedValue([]) // no segments returned

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation'], mockPool, controller.signal)
      })

      expect(data.translationSentences[0]).toMatchObject({
        text: '你好，世界',
        romanization: '',
        translation: 'Hello, world', // falls back to VocabEntry snapshot
      })
    })

    it('calls getSegments once per unique lesson for multi-lesson pool', async () => {
      const multiLessonPool = [
        { ...mockPool[0], sourceLessonId: 'lesson-a', sourceSegmentId: 'seg-1' },
        { ...mockPool[1], sourceLessonId: 'lesson-b', sourceSegmentId: 'seg-2' },
      ]
      mockGetSegments.mockResolvedValue([])

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      await act(async () => {
        await result.current.generateQuiz(['translation', 'translation'], multiLessonPool, controller.signal)
      })

      expect(mockGetSegments).toHaveBeenCalledTimes(2)
      expect(mockGetSegments).toHaveBeenCalledWith(mockDb, 'lesson-a')
      expect(mockGetSegments).toHaveBeenCalledWith(mockDb, 'lesson-b')
    })

    it('does not mix up segments when two lessons share the same segment id integers', async () => {
      // Both lessons have a segment with id "0" — classic per-lesson integer collision
      const lessonASegs = [{ id: '0', text: '你好', romanization: 'nǐ hǎo', translations: { en: 'Hello' }, words: [] }]
      const lessonBSegs = [{ id: '0', text: '再见', romanization: 'zài jiàn', translations: { en: 'Goodbye' }, words: [] }]

      mockGetSegments.mockImplementation((_db: any, lessonId: string) =>
        Promise.resolve(lessonId === 'lesson-a' ? lessonASegs : lessonBSegs),
      )

      const multiLessonPool = [
        { ...mockPool[0], sourceLessonId: 'lesson-a', sourceSegmentId: '0', sourceSegmentText: '你好' },
        { ...mockPool[1], sourceLessonId: 'lesson-b', sourceSegmentId: '0', sourceSegmentText: '再见' },
      ]

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation', 'translation'], multiLessonPool, controller.signal)
      })

      expect(data.translationSentences[0].text).toBe('你好')
      expect(data.translationSentences[0].translation).toBe('Hello')
      expect(data.translationSentences[1].text).toBe('再见')
      expect(data.translationSentences[1].translation).toBe('Goodbye')
    })

    it('returns empty translationSentences when db is null', async () => {
      mockAuth = { keys: { openrouterApiKey: 'sk-test' }, db: null }

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation'], mockPool, controller.signal)
      })

      expect(data.translationSentences).toHaveLength(0)
    })

    it('returns empty translationSentences when getSegments rejects', async () => {
      mockGetSegments.mockRejectedValue(new Error('idb failure'))

      const { result } = renderHook(() => useQuizGeneration())
      const controller = new AbortController()

      let data: any
      await act(async () => {
        data = await result.current.generateQuiz(['translation'], mockPool, controller.signal)
      })

      expect(data.translationSentences).toHaveLength(0)
    })
  })
})
