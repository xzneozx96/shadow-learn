// Import after mocks
import type { SessionQuestion } from '@/lib/study-utils'
import { fireEvent, render, screen } from '@testing-library/react'

import { describe, expect, it, vi } from 'vitest'
import { StudySession } from '@/components/study/StudySession'

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', setLocale: async () => {} }),
}))

// Mock all deps that StudySession pulls in
vi.mock('@/contexts/VocabularyContext', () => ({
  useVocabulary: () => ({
    entriesByLesson: { lesson_1: [] },
    entries: [],
    isSaved: () => false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTracking', () => ({
  useTracking: () => ({
    logExerciseResult: vi.fn(),
    getDueItemCount: vi.fn(),
    getDueItemsList: vi.fn(),
    logSessionComplete: vi.fn(),
  }),
}))

vi.mock('react-router-dom', () => ({
  useBlocker: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
}))

vi.mock('@/hooks/useQuizGeneration', () => ({
  useQuizGeneration: () => ({ generateQuiz: vi.fn(), loading: false }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

vi.mock('@/lib/posthog', () => ({
  posthog: { capture: vi.fn(), captureException: vi.fn() },
}))

const entry = { id: 'v1', word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '', sourceLanguage: 'zh-CN' } as any
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
