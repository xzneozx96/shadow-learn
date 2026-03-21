import type { VocabEntry } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Import after mocks are hoisted
import { LessonWorkbookPanel } from '@/components/lesson/LessonWorkbookPanel'

const mockNavigate = vi.fn()

let mockVocab: { entriesByLesson: Record<string, VocabEntry[]> } = { entriesByLesson: {} }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode, to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null }),
}))

vi.mock('@/contexts/I18nContext', async () => {
  const { TRANSLATIONS } = await import('@/lib/i18n')
  return {
    useI18n: () => ({
      locale: 'en' as const,
      setLocale: async () => {},
      t: (key: string) => (TRANSLATIONS.en as Record<string, string>)[key] ?? key,
    }),
  }
})

vi.mock('@/contexts/VocabularyContext', () => ({
  useVocabulary: () => mockVocab,
}))

// Mock StudySession so we don't need to stub all its dependencies
vi.mock('@/components/study/StudySession', () => ({
  StudySession: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="study-session">
      <button type="button" aria-label="Close" onClick={onClose}>Close</button>
    </div>
  ),
}))

const mockEntries: VocabEntry[] = [
  {
    id: 'e1',
    word: '今天',
    romanization: 'jīntiān',
    meaning: 'today',
    usage: '今天很好。',
    sourceLessonId: 'lesson_1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 'seg_1',
    sourceSegmentText: '今天好',
    sourceSegmentTranslation: 'Good today',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'e2',
    word: '朋友',
    romanization: 'péngyou',
    meaning: 'friend',
    usage: '你是我的朋友。',
    sourceLessonId: 'lesson_1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 'seg_2',
    sourceSegmentText: '你是我的朋友。',
    sourceSegmentTranslation: 'You are my friend',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-01-01T00:00:01.000Z',
  },
]

describe('lessonWorkbookPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVocab = { entriesByLesson: {} }
  })

  it('shows empty-state message when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText(/tap the bookmark/i)).toBeTruthy()
  })

  it('shows "0 words saved" in sub-header', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('0 words saved')).toBeTruthy()
  })

  it('shows word cards when entries exist for the lesson', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('今天')).toBeTruthy()
    expect(screen.getByText('朋友')).toBeTruthy()
  })

  it('shows correct word count in sub-header', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('2 words saved')).toBeTruthy()
  })

  it('shows "1 word saved" (singular) for exactly one entry', () => {
    mockVocab = { entriesByLesson: { lesson_1: [mockEntries[0]] } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('1 word saved')).toBeTruthy()
  })

  it('navigates to lesson segment on word card click', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    // The character text is inside the button — click the button element
    const btn = screen.getByText('今天').closest('[role="button"]')!
    fireEvent.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/lesson/lesson_1?segmentId=seg_1')
  })

  it('study button is disabled when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).toBeDisabled()
  })

  it('study button is enabled when words exist', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).not.toBeDisabled()
  })

  it('does not show entries for a different lessonId', () => {
    mockVocab = { entriesByLesson: { other_lesson: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByText('今天')).toBeNull()
  })

  it('shows study session overlay when Study button is clicked', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByTestId('study-session')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    expect(screen.getByTestId('study-session')).toBeTruthy()
  })

  it('closes study session overlay when StudySession calls onClose', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    // Simulate onClose being called from within StudySession
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('study-session')).toBeNull()
  })
})
