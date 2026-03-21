import type { LessonMeta, Segment, Word } from '@/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVocabulary, VocabularyProvider } from '@/contexts/VocabularyContext'

// Mock AuthContext
const mockDb = {
  getAll: vi.fn().mockResolvedValue([]),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  getAllFromIndex: vi.fn().mockResolvedValue([]),
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: mockDb, keys: null }),
}))

const word: Word = { word: '今天', romanization: 'jīntiān', meaning: 'today', usage: '今天很好。' }
const segment: Segment = {
  id: 'seg_001',
  start: 0,
  end: 5,
  text: '今天天气非常好！',
  romanization: '...',
  translations: { en: 'Nice today!' },
  words: [word],
}
const lesson: LessonMeta = {
  id: 'lesson_abc',
  title: 'Test',
  source: 'youtube',
  sourceUrl: null,
  translationLanguages: ['en'],
  createdAt: '',
  lastOpenedAt: '',
  progressSegmentId: null,
  tags: [],
}

describe('useVocabulary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.getAll.mockResolvedValue([])
  })

  it('isSaved returns false when entry not in list', () => {
    mockDb.getAll.mockResolvedValue([])
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    expect(result.current.isSaved('今天', 'lesson_abc')).toBe(false)
  })

  it('save writes a VocabEntry with correct fields', async () => {
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    await act(async () => {
      await result.current.save(word, segment, lesson, 'en')
    })
    expect(mockDb.put).toHaveBeenCalledWith('vocabulary', expect.objectContaining({
      word: '今天',
      romanization: 'jīntiān',
      sourceLessonId: 'lesson_abc',
      sourceSegmentId: 'seg_001',
      sourceSegmentTranslation: 'Nice today!',
    }))
  })

  it('isSaved returns true after save', async () => {
    const entry = { id: 'x', word: '今天', sourceLessonId: 'lesson_abc', createdAt: '' }
    mockDb.getAll.mockResolvedValue([entry])
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    // Allow effect to run
    await act(async () => {})
    expect(result.current.isSaved('今天', 'lesson_abc')).toBe(true)
  })

  it('remove calls db.delete with entry id', async () => {
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    await act(async () => await result.current.remove('entry-id'))
    expect(mockDb.delete).toHaveBeenCalledWith('vocabulary', 'entry-id')
  })

  it('remove cascades to spaced-repetition and mistakes-db', async () => {
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    await act(async () => {
      await result.current.save(word, segment, lesson, 'en')
    })
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    const id = result.current.entries[0].id
    mockDb.delete.mockClear()

    await act(async () => {
      await result.current.remove(id)
    })

    expect(mockDb.delete).toHaveBeenCalledWith('vocabulary', id)
    expect(mockDb.delete).toHaveBeenCalledWith('spaced-repetition', id)
    expect(mockDb.delete).toHaveBeenCalledWith('mistakes-db', id)
    await waitFor(() => expect(result.current.entries).toHaveLength(0))
  })
})
