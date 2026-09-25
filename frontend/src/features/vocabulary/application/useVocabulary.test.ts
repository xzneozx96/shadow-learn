import type { DataClient } from '@/db'
import type { LessonMeta, Segment, VocabEntry, Word } from '@/shared/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVocabulary, VocabularyProvider } from '@/features/vocabulary/application/VocabularyContext'
import { FakeApiClient, fakeDataClient } from '../../../../tests/fake-api'

let api: FakeApiClient
let client: DataClient

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: client }),
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

function entry(id: string, lessonId = 'lesson_abc'): VocabEntry {
  return {
    id,
    word: '今天',
    romanization: 'jīntiān',
    meaning: 'today',
    usage: '',
    sourceLessonId: lessonId,
    sourceLessonTitle: 'Test',
    sourceSegmentId: 'seg_001',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-09-24T00:00:00.000Z',
  }
}

async function renderReady() {
  const hook = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

describe('useVocabulary', () => {
  beforeEach(() => {
    api = new FakeApiClient()
    client = fakeDataClient(api)
  })

  it('goes from loading to ready with the server entries', async () => {
    api.seedStore('vocabulary', [entry('a'), entry('b', 'lesson_other')])
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeNull()
    expect(result.current.entries.map(e => e.id).sort()).toEqual(['a', 'b'])
    expect(Object.keys(result.current.entriesByLesson).sort()).toEqual(['lesson_abc', 'lesson_other'])
    expect(result.current.isSaved('今天', 'lesson_abc')).toBe(true)
    expect(result.current.isSaved('今天', 'lesson_missing')).toBe(false)
  })

  it('goes from loading to error, and reload() recovers', async () => {
    api.seedStore('vocabulary', [entry('a')])
    api.failWith('/api/store/vocabulary', 503)
    const { result } = renderHook(() => useVocabulary(), { wrapper: VocabularyProvider })
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/503/)
    expect(result.current.entries).toEqual([])

    api.heal('/api/store/vocabulary')
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBeNull()
    expect(result.current.entries.map(e => e.id)).toEqual(['a'])
  })

  it('save stores a VocabEntry with the lesson and segment fields', async () => {
    const { result } = await renderReady()
    await act(async () => {
      await result.current.save(word, segment, lesson, 'en')
    })

    const stored = api.storeRows<VocabEntry>('vocabulary')
    expect(stored).toEqual([expect.objectContaining({
      word: '今天',
      romanization: 'jīntiān',
      sourceLessonId: 'lesson_abc',
      sourceSegmentId: 'seg_001',
      sourceSegmentTranslation: 'Nice today!',
    })])
    expect(result.current.entries).toEqual(stored)
    expect(result.current.isSaved('今天', 'lesson_abc')).toBe(true)
  })

  it('remove deletes the entry with its spaced-repetition and mistakes rows', async () => {
    api.seedStore('vocabulary', [entry('a'), entry('b')])
      .seedStore('spaced-repetition', [{ itemId: 'a', dueDate: '2026-09-24' }, { itemId: 'b', dueDate: '2026-09-24' }])
      .seedStore('mistakes-db', [{ patternId: 'a', frequency: 1, lastOccurred: '', examples: [] }])
    const { result } = await renderReady()

    await act(async () => {
      await result.current.remove('a')
    })

    expect(result.current.entries.map(e => e.id)).toEqual(['b'])
    expect(api.storeRows<VocabEntry>('vocabulary').map(e => e.id)).toEqual(['b'])
    expect(api.storeRows<{ itemId: string }>('spaced-repetition').map(r => r.itemId)).toEqual(['b'])
    expect(api.storeRows('mistakes-db')).toEqual([])
  })

  it('removeGroup deletes every entry of the lesson and their review rows', async () => {
    api.seedStore('vocabulary', [entry('a'), entry('b'), entry('c', 'lesson_other')])
      .seedStore('spaced-repetition', [{ itemId: 'a', dueDate: '2026-09-24' }, { itemId: 'c', dueDate: '2026-09-24' }])
      .seedStore('mistakes-db', [{ patternId: 'b', frequency: 1, lastOccurred: '', examples: [] }])
    const { result } = await renderReady()

    await act(async () => {
      await result.current.removeGroup('lesson_abc')
    })

    expect(result.current.entries.map(e => e.id)).toEqual(['c'])
    expect(api.storeRows<VocabEntry>('vocabulary').map(e => e.id)).toEqual(['c'])
    expect(api.storeRows<{ itemId: string }>('spaced-repetition').map(r => r.itemId)).toEqual(['c'])
    expect(api.storeRows('mistakes-db')).toEqual([])
  })
})
