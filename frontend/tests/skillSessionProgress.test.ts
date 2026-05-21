import type { ShadowLearnDB } from '@/db'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSpacedRepetitionItem, initDB } from '@/db'
import {
  bufferSM2Score,
  clearExpiredSessionKeys,
  clearSM2Pending,
  flushSM2Pending,
  getSkillProgress,
  getSM2Pending,
  isReadingDone,
  isSkillDone,
  markReadingSubmitted,
  markWordComplete,
} from '@/lib/skillSessionProgress'
import 'fake-indexeddb/auto'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-05-14T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('getSkillProgress', () => {
  it('returns empty array when no progress yet', () => {
    expect(getSkillProgress('vocabulary', '2026-05-14')).toEqual([])
  })

  it('returns ids after markWordComplete', () => {
    markWordComplete('vocabulary', '2026-05-14', 'v1')
    expect(getSkillProgress('vocabulary', '2026-05-14')).toEqual(['v1'])
  })

  it('does not duplicate ids', () => {
    markWordComplete('vocabulary', '2026-05-14', 'v1')
    markWordComplete('vocabulary', '2026-05-14', 'v1')
    expect(getSkillProgress('vocabulary', '2026-05-14')).toHaveLength(1)
  })
})

describe('isSkillDone', () => {
  it('false when no words completed', () => {
    expect(isSkillDone('vocabulary', '2026-05-14', ['v1', 'v2'])).toBe(false)
  })

  it('false when only some words completed', () => {
    markWordComplete('vocabulary', '2026-05-14', 'v1')
    expect(isSkillDone('vocabulary', '2026-05-14', ['v1', 'v2'])).toBe(false)
  })

  it('true when all words completed', () => {
    markWordComplete('vocabulary', '2026-05-14', 'v1')
    markWordComplete('vocabulary', '2026-05-14', 'v2')
    expect(isSkillDone('vocabulary', '2026-05-14', ['v1', 'v2'])).toBe(true)
  })

  it('true with empty word list', () => {
    expect(isSkillDone('vocabulary', '2026-05-14', [])).toBe(true)
  })
})

describe('markReadingSubmitted / isReadingDone', () => {
  it('false before submission', () => {
    expect(isReadingDone('2026-05-14')).toBe(false)
  })

  it('true after markReadingSubmitted', () => {
    markReadingSubmitted('2026-05-14')
    expect(isReadingDone('2026-05-14')).toBe(true)
  })
})

describe('clearExpiredSessionKeys', () => {
  it('removes keys from previous days', () => {
    localStorage.setItem('skill-session-2026-05-13-vocabulary', '["v1"]')
    localStorage.setItem('sm2-pending-2026-05-13', '{"v1":50}')
    clearExpiredSessionKeys('2026-05-14')
    expect(localStorage.getItem('skill-session-2026-05-13-vocabulary')).toBeNull()
    expect(localStorage.getItem('sm2-pending-2026-05-13')).toBeNull()
  })

  it('does not remove today\'s keys', () => {
    localStorage.setItem('skill-session-2026-05-14-vocabulary', '["v1"]')
    clearExpiredSessionKeys('2026-05-14')
    expect(localStorage.getItem('skill-session-2026-05-14-vocabulary')).not.toBeNull()
  })

  it('removes sm2-pending keys older than today', () => {
    localStorage.setItem('sm2-pending-2026-05-10', '{"v1":50}')
    localStorage.setItem('sm2-pending-2026-05-12', '{"v2":80}')
    clearExpiredSessionKeys('2026-05-14')
    expect(localStorage.getItem('sm2-pending-2026-05-10')).toBeNull()
    expect(localStorage.getItem('sm2-pending-2026-05-12')).toBeNull()
  })
})

describe('sM-2 buffer', () => {
  it('bufferSM2Score stores first score', () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    expect(getSM2Pending('2026-05-14')).toEqual({ v1: 80 })
  })

  it('bufferSM2Score keeps minimum (worst-score-wins)', () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    bufferSM2Score('v1', 30, '2026-05-14')
    bufferSM2Score('v1', 100, '2026-05-14')
    expect(getSM2Pending('2026-05-14')).toEqual({ v1: 30 })
  })

  it('clearSM2Pending removes the key', () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    clearSM2Pending('2026-05-14')
    expect(getSM2Pending('2026-05-14')).toEqual({})
  })

  it('buffers multiple words independently', () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    bufferSM2Score('v2', 40, '2026-05-14')
    bufferSM2Score('v1', 20, '2026-05-14')
    const pending = getSM2Pending('2026-05-14')
    expect(pending).toEqual({ v1: 20, v2: 40 })
  })
})

describe('flushSM2Pending', () => {
  let db: ShadowLearnDB

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    db = await initDB()
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-14T10:00:00.000Z'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    localStorage.clear()
    db.close()
    globalThis.indexedDB = new IDBFactory()
  })

  it('writes SM-2 item with buffered worst score', async () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    bufferSM2Score('v1', 20, '2026-05-14')
    await flushSM2Pending(db, '2026-05-14')
    const item = await getSpacedRepetitionItem(db, 'v1')
    // score 20 → quality 1 → intervalDays 1, repetitions 0 (fail path resets)
    // dueDate is set to today + intervalDays = 2026-05-15
    expect(item).not.toBeUndefined()
    expect(item?.dueDate).toBe('2026-05-15')
  })

  it('clears the pending key after flush', async () => {
    bufferSM2Score('v1', 80, '2026-05-14')
    await flushSM2Pending(db, '2026-05-14')
    expect(getSM2Pending('2026-05-14')).toEqual({})
  })

  it('no-op when pending is empty', async () => {
    await expect(flushSM2Pending(db, '2026-05-14')).resolves.not.toThrow()
  })

  it('flushes multiple words independently', async () => {
    // First flush: both score high, both get intervalDays 1
    bufferSM2Score('v1', 100, '2026-05-14')
    bufferSM2Score('v2', 100, '2026-05-14')
    await flushSM2Pending(db, '2026-05-14')

    // Second flush (simulating a future review): v1 stays high, v2 fails
    bufferSM2Score('v1', 100, '2026-05-14')
    bufferSM2Score('v2', 0, '2026-05-14')
    await flushSM2Pending(db, '2026-05-14')

    const item1 = await getSpacedRepetitionItem(db, 'v1')
    const item2 = await getSpacedRepetitionItem(db, 'v2')
    expect(item1).not.toBeUndefined()
    expect(item2).not.toBeUndefined()
    // v1 has 2 successful reviews → intervalDays 3 (Anki-style: round(1×EF))
    // v2 failed on second review → intervalDays 1
    expect((item1?.intervalDays ?? 0) > (item2?.intervalDays ?? 0)).toBe(true)
  })
})
