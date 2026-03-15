import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock useVocabulary as vi.fn so individual tests can override return value
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: vi.fn(() => ({ entriesByLesson: {} })),
}))

// Avoid rendering LessonWorkbookPanel internals in these tab-bar tests
vi.mock('@/components/lesson/LessonWorkbookPanel', () => ({
  LessonWorkbookPanel: ({ lessonId }: { lessonId: string }) => (
    <div data-testid="workbook-panel">{lessonId}</div>
  ),
}))

// Import after mocks are hoisted
import type { VocabEntry } from '@/types'
import { useVocabulary } from '@/hooks/useVocabulary'
import { CompanionPanel } from '@/components/lesson/CompanionPanel'

const defaultProps = {
  messages: [],
  isStreaming: false,
  onSend: vi.fn(),
  activeSegment: null,
  model: 'gpt-4o-mini',
  onModelChange: vi.fn(),
  lessonId: 'lesson_1',
}

describe('CompanionPanel — tab bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useVocabulary).mockReturnValue({ entriesByLesson: {} } as ReturnType<typeof useVocabulary>)
  })

  it('renders "AI Companion" tab trigger', () => {
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('AI Companion')).toBeTruthy()
  })

  it('renders "Workbook" tab trigger', () => {
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('Workbook')).toBeTruthy()
  })

  it('does not show a badge when no words are saved for this lesson', () => {
    render(<CompanionPanel {...defaultProps} />)
    // Badge should not be present (count is 0)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows badge with count when words are saved for this lesson', () => {
    vi.mocked(useVocabulary).mockReturnValue({
      entriesByLesson: {
        lesson_1: [{} as VocabEntry, {} as VocabEntry],
      },
    } as ReturnType<typeof useVocabulary>)
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('2')).toBeTruthy()
  })
})
