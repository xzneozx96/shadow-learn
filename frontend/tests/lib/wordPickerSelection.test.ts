import type { VocabDayGroup } from '@/lib/vocabGrouping'
import type { VocabEntry } from '@/types'
import { describe, expect, it } from 'vitest'
import {
  getGroupTriState,
  getInitialPickerState,
  toggleGroup,
  toggleWord,
} from '@/lib/wordPickerSelection'

function makeEntry(id: string, createdAt = '2026-05-16T12:00:00.000Z'): VocabEntry {
  return {
    id,
    word: '词',
    romanization: 'cí',
    meaning: 'word',
    usage: '',
    sourceLessonId: 'lesson-1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 'seg-1',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    createdAt,
  }
}

function makeGroup(key: string, label: string, ids: string[]): VocabDayGroup {
  return { key, label, entries: ids.map(id => makeEntry(id)) }
}

describe('getInitialPickerState', () => {
  it('returns empty sets when no groups', () => {
    const state = getInitialPickerState([])
    expect(state.selectedIds.size).toBe(0)
    expect(state.expandedKeys.size).toBe(0)
  })

  it('selects all entries from the newest non-empty group and expands only it', () => {
    const groups = [
      makeGroup('today', 'Today', ['a', 'b']),
      makeGroup('yesterday', 'Yesterday', ['c']),
    ]
    const state = getInitialPickerState(groups)
    expect([...state.selectedIds].sort()).toEqual(['a', 'b'])
    expect([...state.expandedKeys]).toEqual(['today'])
  })

  it('skips empty groups when picking the default', () => {
    const groups = [
      makeGroup('today', 'Today', []),
      makeGroup('yesterday', 'Yesterday', ['c']),
    ]
    const state = getInitialPickerState(groups)
    expect([...state.selectedIds]).toEqual(['c'])
    expect([...state.expandedKeys]).toEqual(['yesterday'])
  })
})

describe('getGroupTriState', () => {
  const group = makeGroup('today', 'Today', ['a', 'b', 'c'])

  it('returns "none" when no entries selected', () => {
    expect(getGroupTriState(group, new Set())).toBe('none')
  })

  it('returns "some" when partial', () => {
    expect(getGroupTriState(group, new Set(['a']))).toBe('some')
  })

  it('returns "all" when every entry selected', () => {
    expect(getGroupTriState(group, new Set(['a', 'b', 'c']))).toBe('all')
  })

  it('returns "none" for an empty group', () => {
    const empty = makeGroup('today', 'Today', [])
    expect(getGroupTriState(empty, new Set())).toBe('none')
  })
})

describe('toggleGroup', () => {
  const group = makeGroup('today', 'Today', ['a', 'b'])

  it('selects every entry when state is "none"', () => {
    const result = toggleGroup(group, new Set())
    expect([...result].sort()).toEqual(['a', 'b'])
  })

  it('selects every entry when state is "some"', () => {
    const result = toggleGroup(group, new Set(['a']))
    expect([...result].sort()).toEqual(['a', 'b'])
  })

  it('deselects every entry when state is "all"', () => {
    const result = toggleGroup(group, new Set(['a', 'b']))
    expect([...result]).toEqual([])
  })

  it('preserves selections from other groups', () => {
    const result = toggleGroup(group, new Set(['x', 'y']))
    expect([...result].sort()).toEqual(['a', 'b', 'x', 'y'])
  })

  it('returns a new Set instance (no mutation)', () => {
    const input = new Set(['a'])
    const result = toggleGroup(group, input)
    expect(result).not.toBe(input)
    expect([...input]).toEqual(['a'])
  })
})

describe('toggleWord', () => {
  it('adds the id when missing', () => {
    const result = toggleWord('a', new Set(['b']))
    expect([...result].sort()).toEqual(['a', 'b'])
  })

  it('removes the id when present', () => {
    const result = toggleWord('a', new Set(['a', 'b']))
    expect([...result]).toEqual(['b'])
  })

  it('returns a new Set instance (no mutation)', () => {
    const input = new Set(['a'])
    const result = toggleWord('b', input)
    expect(result).not.toBe(input)
    expect([...input]).toEqual(['a'])
  })
})
