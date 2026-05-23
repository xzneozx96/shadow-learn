// Import after mocks are hoisted
import type { VocabEntry } from '@/shared/types'
import { render, screen } from '@testing-library/react'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionPanel } from '@/features/agent/ui/CompanionPanel'
import { useVocabulary } from '@/features/vocabulary/application/VocabularyContext'

// Mock I18nContext so CompanionPanel can be rendered without an I18nProvider in tests.
vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// Mock useVocabulary from its actual module path
vi.mock('@/features/vocabulary/application/VocabularyContext', () => ({
  useVocabulary: vi.fn(() => ({ entriesByLesson: {} })),
}))

// Mock GlobalCompanionContext used by the rewritten CompanionPanel
vi.mock('@/features/agent/application/GlobalCompanionContext', () => ({
  useGlobalCompanionContext: vi.fn(() => ({
    chips: [],
    removeChip: vi.fn(),
    clearChips: vi.fn(),
    isGlobalPanelOpen: false,
    addChip: vi.fn(),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
  })),
}))

vi.mock('@/features/speak/application/SpeakModalContext', () => ({
  useSpeakModal: vi.fn(() => ({
    isOpen: false,
    openSpeakModal: vi.fn(),
    closeSpeakModal: vi.fn(),
  })),
}))

// Mock AuthContext
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isUnlocked: true,
    db: {},
    keys: {},
    unlock: vi.fn(),
  })),
}))

// Mock AgentActionsContext — CompanionPanel reads dispatchAction from it
vi.mock('@/features/agent/application/AgentActionsContext', () => ({
  useAgentActions: vi.fn(() => ({
    pendingAction: null,
    dispatchAction: vi.fn(),
    clearAction: vi.fn(),
  })),
}))

// Mock useZoberChat so CompanionPanel renders without hitting real IDB/API
vi.mock('@/features/agent/application/useZoberChat', () => ({
  useZoberChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    status: 'ready',
    sendMessage: vi.fn(),
    stop: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    error: undefined,
  })),
}))

// Avoid rendering LessonWorkbookPanel internals in these tab-bar tests
vi.mock('@/features/lesson/ui/LessonWorkbookPanel', () => ({
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
  beforeAll(() => {
    // jsdom does not implement IntersectionObserver; stub it for the chat scroll sentinel
    // jsdom does not implement IntersectionObserver; provide a no-op class stub
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.IntersectionObserver = MockIntersectionObserver as any
  })

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
