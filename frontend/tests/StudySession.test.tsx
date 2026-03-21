import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Import after mocks
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
})
