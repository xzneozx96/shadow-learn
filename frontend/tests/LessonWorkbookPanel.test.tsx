import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null }),
}))

// Render tooltip content inline — no hover / portal required in jsdom
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

type MockEntry = {
  id: string
  word: string
  pinyin: string
  meaning: string
  sourceLessonId: string
  sourceSegmentId: string
}

const mockEntries: MockEntry[] = [
  { id: 'e1', word: '今天', pinyin: 'jīntiān', meaning: 'today', sourceLessonId: 'lesson_1', sourceSegmentId: 'seg_1' },
  { id: 'e2', word: '朋友', pinyin: 'péngyou', meaning: 'friend', sourceLessonId: 'lesson_1', sourceSegmentId: 'seg_2' },
]

let mockVocab: { entriesByLesson: Record<string, MockEntry[]> } = { entriesByLesson: {} }

vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => mockVocab,
}))

// Import after mocks are hoisted
import { LessonWorkbookPanel } from '@/components/lesson/LessonWorkbookPanel'

describe('LessonWorkbookPanel', () => {
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
    const btn = screen.getByText('今天').closest('button')!
    fireEvent.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/lesson/lesson_1?segmentId=seg_1')
  })

  it('Study button is disabled when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).toBeDisabled()
  })

  it('shows tooltip text when Study button is disabled', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('Save at least one word first')).toBeTruthy()
  })

  it('Study button is enabled when words exist', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).not.toBeDisabled()
  })

  it('Study button navigates to study session on click', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/vocabulary/lesson_1/study')
  })

  it('does not show entries for a different lessonId', () => {
    mockVocab = { entriesByLesson: { other_lesson: mockEntries } }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByText('今天')).toBeNull()
  })
})
