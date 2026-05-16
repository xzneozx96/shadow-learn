import type { VocabEntry } from '@/types'
import { describe, expect, it } from 'vitest'
import { groupVocabByDay } from '@/lib/vocabGrouping'

// Fixed reference point: noon local time on a known date avoids day-boundary issues
const NOW = new Date(2026, 4, 16, 12, 0, 0) // 2026-05-16 12:00 local
const TODAY_NOON = NOW.toISOString()
const TODAY_MORNING = new Date(2026, 4, 16, 9, 0, 0).toISOString()
const YESTERDAY_NOON = new Date(2026, 4, 15, 12, 0, 0).toISOString()
const OLD = new Date(2026, 0, 5, 12, 0, 0).toISOString() // 2026-01-05 local

function makeEntry(overrides: Partial<VocabEntry> & { createdAt: string }): VocabEntry {
  return {
    id: crypto.randomUUID(),
    word: '你好',
    romanization: 'nǐ hǎo',
    meaning: 'hello',
    usage: '',
    sourceLessonId: 'lesson-1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 'seg-1',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    ...overrides,
  }
}

describe('groupVocabByDay', () => {
  it('returns empty array for no entries', () => {
    expect(groupVocabByDay([], NOW)).toEqual([])
  })

  it('groups entries from the same day into one group', () => {
    const entries = [
      makeEntry({ id: '1', createdAt: TODAY_MORNING }),
      makeEntry({ id: '2', createdAt: TODAY_NOON }),
    ]
    const groups = groupVocabByDay(entries, NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].entries).toHaveLength(2)
  })

  it('splits entries from different days into separate groups', () => {
    const entries = [
      makeEntry({ id: '1', createdAt: TODAY_NOON }),
      makeEntry({ id: '2', createdAt: YESTERDAY_NOON }),
    ]
    const groups = groupVocabByDay(entries, NOW)
    expect(groups).toHaveLength(2)
  })

  it('orders groups newest-first', () => {
    const entries = [
      makeEntry({ id: 'old', createdAt: YESTERDAY_NOON }),
      makeEntry({ id: 'new', createdAt: TODAY_NOON }),
    ]
    const groups = groupVocabByDay(entries, NOW)
    expect(groups[0].entries[0].id).toBe('new')
    expect(groups[1].entries[0].id).toBe('old')
  })

  it('labels today as "Today"', () => {
    const groups = groupVocabByDay([makeEntry({ createdAt: TODAY_NOON })], NOW)
    expect(groups[0].label).toBe('Today')
  })

  it('labels yesterday as "Yesterday"', () => {
    const groups = groupVocabByDay([makeEntry({ createdAt: YESTERDAY_NOON })], NOW)
    expect(groups[0].label).toBe('Yesterday')
  })

  it('labels older dates with formatted date string', () => {
    const groups = groupVocabByDay([makeEntry({ createdAt: OLD })], NOW)
    expect(groups[0].label).toMatch(/Jan/)
    expect(groups[0].label).toMatch(/5/)
    expect(groups[0].label).toMatch(/2026/)
  })

  it('preserves entry order within a group (newest first)', () => {
    const entries = [
      makeEntry({ id: 'early', createdAt: TODAY_MORNING }),
      makeEntry({ id: 'late', createdAt: TODAY_NOON }),
    ]
    const groups = groupVocabByDay(entries, NOW)
    expect(groups[0].entries[0].id).toBe('late')
    expect(groups[0].entries[1].id).toBe('early')
  })
})
