import type { VocabEntry } from '@/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Import after mocks are hoisted
import { LessonWorkbookPanel } from '@/components/lesson/LessonWorkbookPanel'

const mockNavigate = vi.fn()

let mockVocab: { entriesByLesson: Record<string, VocabEntry[]>, remove: (id: string) => Promise<void> }
  = { entriesByLesson: {}, remove: async () => {} }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode, to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
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

// Mock the new picker + practice modal components — we just need to know when
// they are opened.
interface PickerProps { open?: boolean, entries?: VocabEntry[], onConfirm?: (selected: VocabEntry[]) => void, onClose?: () => void }
interface PracticeProps { open?: boolean, entries?: VocabEntry[], lessonTitle?: string, onClose?: () => void }
let capturedPracticeProps: PracticeProps = {}

vi.mock('@/components/lesson/WordPickerDialog', () => ({
  WordPickerDialog: (props: PickerProps) => {
    if (!props.open)
      return null
    return (
      <div data-testid="word-picker">
        <button
          type="button"
          data-testid="picker-start"
          onClick={() => props.onConfirm?.(props.entries ?? [])}
        >
          Start
        </button>
        <button type="button" aria-label="Close picker" onClick={() => props.onClose?.()}>
          Close
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/lesson/LessonPracticeModal', () => ({
  LessonPracticeModal: (props: PracticeProps) => {
    capturedPracticeProps = props
    if (!props.open)
      return null
    return (
      <div data-testid="practice-modal">
        <button type="button" aria-label="Close practice" onClick={() => props.onClose?.()}>
          Close
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/workbook/WordBreakdownModal', () => ({
  WordBreakdownModal: () => null,
}))

vi.mock('@/components/lesson/RemoveVocabDialog', () => ({
  RemoveVocabDialog: () => null,
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

vi.mock('@/db', () => ({
  getSettings: async () => undefined,
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
    mockVocab = { entriesByLesson: {}, remove: async () => {} }
    capturedPracticeProps = {}
  })

  it('shows empty-state message when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText(/tap any underlined word/i)).toBeTruthy()
  })

  it('shows "0 words saved" in sub-header', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('0 words saved')).toBeTruthy()
  })

  it('shows word cards when entries exist for the lesson', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('今天')).toBeTruthy()
    expect(screen.getByText('朋友')).toBeTruthy()
  })

  it('shows correct word count in sub-header', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('2 words saved')).toBeTruthy()
  })

  it('shows "1 word saved" (singular) for exactly one entry', () => {
    mockVocab = { entriesByLesson: { lesson_1: [mockEntries[0]] }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByText('1 word saved')).toBeTruthy()
  })

  it('navigates to lesson segment on word card click', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    const btn = screen.getByText('今天').closest('[role="button"]')!
    fireEvent.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/lesson/lesson_1?segmentId=seg_1')
  })

  it('study button is disabled when no words saved', () => {
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).toBeDisabled()
  })

  it('study button is enabled when words exist', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.getByRole('button', { name: /study this lesson/i })).not.toBeDisabled()
  })

  it('does not show entries for a different lessonId', () => {
    mockVocab = { entriesByLesson: { other_lesson: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByText('今天')).toBeNull()
  })

  it('opens the WordPickerDialog when Study button is clicked', () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    expect(screen.queryByTestId('word-picker')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    expect(screen.getByTestId('word-picker')).toBeTruthy()
  })

  it('closes the picker when its onClose is called', async () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    fireEvent.click(screen.getByRole('button', { name: /close picker/i }))
    await waitFor(() => expect(screen.queryByTestId('word-picker')).toBeNull())
  })

  it('opens the practice modal when picker confirms a selection', async () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    fireEvent.click(screen.getByTestId('picker-start'))
    await waitFor(() => expect(screen.queryByTestId('word-picker')).toBeNull())
    expect(screen.getByTestId('practice-modal')).toBeTruthy()
    expect(capturedPracticeProps.entries).toHaveLength(2)
    expect(capturedPracticeProps.lessonTitle).toBe('Lesson 1')
  })

  it('closes the practice modal when its onClose is called', async () => {
    mockVocab = { entriesByLesson: { lesson_1: mockEntries }, remove: async () => {} }
    render(<LessonWorkbookPanel lessonId="lesson_1" />)
    fireEvent.click(screen.getByRole('button', { name: /study this lesson/i }))
    fireEvent.click(screen.getByTestId('picker-start'))
    await waitFor(() => expect(screen.getByTestId('practice-modal')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /close practice/i }))
    await waitFor(() => expect(screen.queryByTestId('practice-modal')).toBeNull())
  })
})
