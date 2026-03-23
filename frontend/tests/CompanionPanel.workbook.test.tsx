// Import after mocks are hoisted
import type { VocabEntry } from '@/types'
import { render, screen } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionPanel } from '@/components/lesson/CompanionPanel'
import { useVocabulary } from '@/contexts/VocabularyContext'

// Mock I18nContext so CompanionPanel can be rendered without an I18nProvider in tests.
vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// Mock useVocabulary from its actual module path
vi.mock('@/contexts/VocabularyContext', () => ({
  useVocabulary: vi.fn(() => ({ entriesByLesson: {} })),
}))

// Mock useAgentChat so CompanionPanel renders without hitting real IDB/API
vi.mock('@/hooks/useAgentChat', () => ({
  useAgentChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    status: 'ready',
    sendMessage: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    error: undefined,
  })),
}))

// Avoid rendering LessonWorkbookPanel internals in these tab-bar tests
vi.mock('@/components/lesson/LessonWorkbookPanel', () => ({
  LessonWorkbookPanel: ({ lessonId }: { lessonId: string }) => (
    <div data-testid="workbook-panel">{lessonId}</div>
  ),
}))

const defaultProps = {
  activeSegment: null,
  lessonId: 'lesson_1',
}

function mockVocabContext(overrides: Partial<ReturnType<typeof useVocabulary>> = {}): ReturnType<typeof useVocabulary> {
  return {
    entries: [],
    entriesByLesson: {},
    save: vi.fn(),
    remove: vi.fn(),
    removeGroup: vi.fn(),
    isSaved: vi.fn(),
    ...overrides,
  }
}

describe('companionPanel — tab bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useVocabulary).mockReturnValue(mockVocabContext())
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
    vi.mocked(useVocabulary).mockReturnValue(mockVocabContext({
      entriesByLesson: {
        lesson_1: [{} as VocabEntry, {} as VocabEntry],
      },
    }))
    render(<CompanionPanel {...defaultProps} />)
    expect(screen.getByText('2')).toBeTruthy()
  })
})
