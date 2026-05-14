import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bufferSM2Score,
  clearExpiredSessionKeys,
  clearSM2Pending,
  getSkillProgress,
  getSM2Pending,
  isReadingDone,
  isSkillDone,
  markReadingSubmitted,
  markWordComplete,
} from '@/lib/skillSessionProgress'

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
