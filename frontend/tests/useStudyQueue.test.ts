import type { ShadowLearnDB } from '@/db'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB, saveSpacedRepetitionItem, saveVocabEntry } from '@/db'
import { useStudyQueue } from '@/hooks/useStudyQueue'
import 'fake-indexeddb/auto'

function makeVocab(id: string) {
  return {
    id,
    word: `词${id}`,
    romanization: 'cí',
    meaning: 'word',
    usage: '',
    sourceLessonId: 'l1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 's1',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-05-13T00:00:00.000Z',
  }
}

function makeSRItem(vocabId: string, dueDate: string) {
  return {
    itemId: vocabId,
    itemType: 'vocabulary' as const,
    easinessFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    consecutiveCorrect: 1,
    consecutiveIncorrect: 0,
    masteryLevel: 1,
    dueDate,
    lastReviewed: '2026-05-12',
    reviewHistory: [],
  }
}

let db: ShadowLearnDB

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'))
  localStorage.clear()
  db = await initDB()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('useStudyQueue', () => {
  it('returns loading=true initially then resolves', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('cold start — no vocab: hasWordDrills false', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasWordDrills).toBe(false)
  })

  it('has vocab but no SR entries: hasWordDrills false', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasWordDrills).toBe(false)
  })

  it('has SR entries due today: hasWordDrills true', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasWordDrills).toBe(true)
  })

  it('caps daily word list at 20', async () => {
    for (let i = 0; i < 25; i++) {
      await saveVocabEntry(db, makeVocab(`v${i}`))
      await saveSpacedRepetitionItem(db, makeSRItem(`v${i}`, '2026-05-13'))
    }
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.wordDrillsEntries.length).toBe(20)
  })

  it('locks daily word list in localStorage on first load', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(localStorage.getItem('daily-review-words-2026-05-13')).not.toBeNull()
  })

  it('addCustomTask adds task to list', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.customTasks).toHaveLength(0)
    await act(() => result.current.addCustomTask('Test task'))
    expect(result.current.customTasks).toHaveLength(1)
    expect(result.current.customTasks[0].title).toBe('Test task')
    expect(result.current.customTasks[0].completedDate).toBeNull()
  })

  it('toggleCustomTask marks task complete and back', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.addCustomTask('Test task'))
    const id = result.current.customTasks[0].id
    await act(() => result.current.toggleCustomTask(id))
    expect(result.current.customTasks[0].completedDate).toBe('2026-05-13')
    await act(() => result.current.toggleCustomTask(id))
    expect(result.current.customTasks[0].completedDate).toBeNull()
  })

  it('removeCustomTask removes task from list', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.addCustomTask('Test task'))
    const id = result.current.customTasks[0].id
    await act(() => result.current.removeCustomTask(id))
    expect(result.current.customTasks).toHaveLength(0)
  })

  it('refresh re-checks completion state', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    localStorage.setItem('daily-review-words-2026-05-13', JSON.stringify(['v1']))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.vocabularyDone).toBe(false)
    // Simulate vocabulary skill completing
    localStorage.setItem('skill-session-2026-05-13-vocabulary', JSON.stringify(['v1']))
    await act(() => result.current.refresh())
    expect(result.current.vocabularyDone).toBe(true)
  })

  it('vocabularyDone false when skill-session key missing', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.vocabularyDone).toBe(false)
  })

  it('vocabularyDone true when all words in skill-session key', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    localStorage.setItem('daily-review-words-2026-05-13', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-vocabulary', JSON.stringify(['v1']))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.vocabularyDone).toBe(true)
  })

  it('readingDone true when reading key is "submitted"', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    localStorage.setItem('daily-review-words-2026-05-13', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-reading', 'submitted')
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.readingDone).toBe(true)
  })

  it('dailyReviewDone true only when all 5 skills done', async () => {
    await saveVocabEntry(db, makeVocab('v1'))
    await saveSpacedRepetitionItem(db, makeSRItem('v1', '2026-05-13'))
    localStorage.setItem('daily-review-words-2026-05-13', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-vocabulary', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-listening', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-speaking', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-writing', JSON.stringify(['v1']))
    localStorage.setItem('skill-session-2026-05-13-reading', 'submitted')
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dailyReviewDone).toBe(true)
  })
})
