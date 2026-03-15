import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Import after mocks
import { StudySession } from '@/components/study/StudySession'

// Mock all deps that StudySession pulls in
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => ({
    entriesByLesson: { lesson_1: [] },
    entries: [],
    isSaved: () => false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

describe('StudySession', () => {
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
