import type { SessionLog } from '@/db'
import { renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB, saveSessionLog } from '@/db'
import { useStudyQueue } from '@/features/study/application/useStudyQueue'
import 'fake-indexeddb/auto'

const TODAY = '2026-05-27'

vi.mock('@/shared/lib/date', () => ({
  todayISO: () => TODAY,
}))

function makeLog(skillPracticed: SessionLog['skillPracticed'], date = TODAY): SessionLog {
  return {
    sessionId: `${skillPracticed}-${date}-${Math.random()}`,
    date,
    durationMinutes: 10,
    skillPracticed,
    exercisesCompleted: 5,
    exercisesCorrect: 4,
    accuracy: 80,
    itemsMastered: [],
  }
}

describe('useStudyQueue — shadowingDone', () => {
  let db: Awaited<ReturnType<typeof initDB>>

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('is false when no session logs exist', async () => {
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.shadowingDone).toBe(false)
  })

  it('is true when a speaking log exists for today', async () => {
    await saveSessionLog(db, makeLog('speaking'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.shadowingDone).toBe(true)
  })

  it('is true when a listening (dictation) log exists for today', async () => {
    await saveSessionLog(db, makeLog('listening'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.shadowingDone).toBe(true)
  })

  it('is false when logs exist only for a different date', async () => {
    await saveSessionLog(db, makeLog('speaking', '2026-05-26'))
    await saveSessionLog(db, makeLog('listening', '2026-05-26'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.shadowingDone).toBe(false)
  })

  it('is false when only non-shadowing skills are logged today', async () => {
    await saveSessionLog(db, makeLog('vocabulary'))
    await saveSessionLog(db, makeLog('reading'))
    const { result } = renderHook(() => useStudyQueue(db, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.shadowingDone).toBe(false)
  })
})
