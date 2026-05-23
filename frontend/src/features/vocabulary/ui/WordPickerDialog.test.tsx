import type { VocabEntry } from '@/shared/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WordPickerDialog } from '@/features/vocabulary/ui/WordPickerDialog'

vi.mock('@/app/providers/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (!vars)
        return key
      let s = key
      for (const [k, v] of Object.entries(vars))
        s = s.replace(`{${k}}`, String(v))
      return s
    },
  }),
}))

function makeEntry(overrides: Partial<VocabEntry> & { id: string, createdAt: string }): VocabEntry {
  return {
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
    ...overrides,
  }
}

const NOW = new Date(2026, 4, 16, 12, 0, 0)
const TODAY = new Date(2026, 4, 16, 9, 0, 0).toISOString()
const YESTERDAY = new Date(2026, 4, 15, 9, 0, 0).toISOString()

describe('wordPickerDialog', () => {
  it('pre-selects the newest non-empty group on open', () => {
    const entries = [
      makeEntry({ id: 'a', word: '一', createdAt: TODAY }),
      makeEntry({ id: 'b', word: '二', createdAt: TODAY }),
      makeEntry({ id: 'c', word: '三', createdAt: YESTERDAY }),
    ]
    render(
      <WordPickerDialog
        open
        onClose={() => {}}
        entries={entries}
        onConfirm={() => {}}
        now={NOW}
      />,
    )
    expect(screen.getByTestId('picker-start')).not.toBeDisabled()
    expect(screen.getByTestId('word-card-a')).toBeInTheDocument()
    expect(screen.getByTestId('word-card-b')).toBeInTheDocument()
    expect(screen.queryByTestId('word-card-c')).toBeNull() // Yesterday collapsed
  })

  it('disables the start button when nothing is selected', () => {
    const entries = [makeEntry({ id: 'a', word: '一', createdAt: TODAY })]
    render(
      <WordPickerDialog
        open
        onClose={() => {}}
        entries={entries}
        onConfirm={() => {}}
        now={NOW}
      />,
    )
    // Toggle off the only selected word via its card.
    fireEvent.click(screen.getByTestId('word-card-a'))
    expect(screen.getByTestId('picker-start')).toBeDisabled()
  })

  it('toggles a whole group via the group header checkbox', () => {
    const entries = [
      makeEntry({ id: 'a', word: '一', createdAt: TODAY }),
      makeEntry({ id: 'b', word: '二', createdAt: TODAY }),
    ]
    render(
      <WordPickerDialog
        open
        onClose={() => {}}
        entries={entries}
        onConfirm={() => {}}
        now={NOW}
      />,
    )
    // Both pre-selected → header tri-state is 'all'. Click header checkbox to deselect all.
    fireEvent.click(screen.getByTestId('group-checkbox-Today'))
    expect(screen.getByTestId('picker-start')).toBeDisabled()
  })

  it('emits the selected entries on confirm', () => {
    const entries = [
      makeEntry({ id: 'a', word: '一', createdAt: TODAY }),
      makeEntry({ id: 'b', word: '二', createdAt: TODAY }),
    ]
    const onConfirm = vi.fn()
    render(
      <WordPickerDialog
        open
        onClose={() => {}}
        entries={entries}
        onConfirm={onConfirm}
        now={NOW}
      />,
    )
    fireEvent.click(screen.getByTestId('picker-start'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const passed = onConfirm.mock.calls[0][0] as VocabEntry[]
    expect(passed.map(e => e.id).sort()).toEqual(['a', 'b'])
  })

  it('expands a collapsed group when its header label is clicked', () => {
    const entries = [
      makeEntry({ id: 'a', word: '一', createdAt: TODAY }),
      makeEntry({ id: 'c', word: '三', createdAt: YESTERDAY }),
    ]
    render(
      <WordPickerDialog
        open
        onClose={() => {}}
        entries={entries}
        onConfirm={() => {}}
        now={NOW}
      />,
    )
    // Yesterday is collapsed → its word card is not in the document.
    expect(screen.queryByTestId('word-card-c')).toBeNull()
    fireEvent.click(screen.getByTestId('group-toggle-Yesterday'))
    expect(screen.getByTestId('word-card-c')).toBeInTheDocument()
  })
})
