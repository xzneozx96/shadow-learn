// Import after mocks
import type { SessionQuestion } from '@/shared/lib/study-utils'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudySession } from '@/features/study/ui/StudySession'

vi.mock('@/app/providers/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', setLocale: async () => {} }),
}))

// Mock all deps that StudySession pulls in
vi.mock('@/features/vocabulary/application/VocabularyContext', () => ({
  useVocabulary: () => ({
    entriesByLesson: { lesson_1: [] },
    entries: [],
    isSaved: () => false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@/shared/hooks/useTracking', () => ({
  useTracking: () => ({
    logExerciseResult: vi.fn(),
    getDueItemCount: vi.fn(),
    getDueItemsList: vi.fn(),
    logSessionComplete: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useBlocker: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  }
})

const mockGenerateQuiz = vi.fn().mockResolvedValue({ clozeExercises: [], pronExercises: [], translationSentences: [] })
vi.mock('@/features/study/application/useQuizGeneration', () => ({
  useQuizGeneration: () => ({ generateQuiz: mockGenerateQuiz, loading: false }),
}))

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

vi.mock('@/shared/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

vi.mock('@/shared/lib/posthog', () => ({
  posthog: { capture: vi.fn(), captureException: vi.fn() },
}))

const entry = { id: 'v1', word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '', sourceLanguage: 'zh-CN', sourceLessonId: 'l1', sourceLessonTitle: 'Test', sourceSegmentId: 's1', sourceSegmentText: '你好', sourceSegmentTranslation: '', createdAt: '' } as any
const questions: SessionQuestion[] = [{ type: 'dictation', entry }]

describe('studySession', () => {
  it('renders ModePicker on initial mount', () => {
    render(<StudySession lessonId="lesson_1" onClose={vi.fn()} />)
    // ModePicker renders a Start button
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<StudySession lessonId="lesson_1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('skips picker and shows session immediately when prebuiltQuestions are provided', () => {
    render(<StudySession onClose={vi.fn()} prebuiltQuestions={questions} />)
    // ModePicker should NOT render (no Start button)
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
  })

  describe('preloadedEntries + handleStart', () => {
    beforeEach(() => {
      mockGenerateQuiz.mockClear()
    })

    it('skips generateQuiz when preloadedEntries is set and mode needs no API', async () => {
      render(<StudySession lessonId="" preloadedEntries={[entry]} onClose={vi.fn()} disableLeaveGuard />)
      // Explicitly select dictation — a mode that needs no API call (no cloze/pronunciation/translation)
      fireEvent.click(screen.getByRole('button', { name: /study.mode.dictation/i }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start/i }))
      })
      expect(mockGenerateQuiz).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
    })

    it('calls generateQuiz when preloadedEntries is set but mode is pronunciation', async () => {
      // Regression test: workbook review with pronunciation mode must still invoke the quiz API.
      // Previously, preloadedEntries triggered an unconditional early return that skipped generateQuiz,
      // causing pronunciation exercises to silently fall back to romanization-recall.
      render(
        <StudySession
          lessonId=""
          preloadedEntries={[entry]}
          onClose={vi.fn()}
          disableLeaveGuard
        />,
      )

      // ModePicker renders mode buttons — explicitly select pronunciation mode
      fireEvent.click(screen.getByRole('button', { name: /study.mode.pronunciation/i }))

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /start/i }))
      })

      // generateQuiz MUST have been called — the early return must not have fired
      expect(mockGenerateQuiz).toHaveBeenCalled()
    })
  })

  describe('disableLeaveGuard', () => {
    it('shows confirm dialog when X is clicked during session (default behavior)', () => {
      render(<StudySession onClose={vi.fn()} prebuiltQuestions={questions} />)
      fireEvent.click(screen.getByRole('button', { name: /close/i }))
      expect(screen.getByRole('dialog', { name: /confirm leave/i })).toBeTruthy()
    })

    it('calls onClose immediately when X is clicked during session with disableLeaveGuard', () => {
      const onClose = vi.fn()
      render(<StudySession onClose={onClose} prebuiltQuestions={questions} disableLeaveGuard />)
      fireEvent.click(screen.getByRole('button', { name: /close/i }))
      expect(onClose).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog', { name: /confirm leave/i })).toBeNull()
    })
  })
})
