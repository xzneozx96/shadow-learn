import type { SessionQuestion } from '@/lib/study-utils'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExerciseRenderer } from '@/components/lesson/ExerciseRenderer'

let capturedStudySessionProps: Record<string, unknown> = {}

vi.mock('@/components/study/StudySession', () => ({
  StudySession: (props: Record<string, unknown>) => {
    capturedStudySessionProps = props
    return <div data-testid="study-session" />
  },
}))

const entry = { id: 'v1', word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '', sourceLanguage: 'zh-CN' } as any
const questions: SessionQuestion[] = [{ type: 'dictation', entry }]

describe('exerciseRenderer', () => {
  it('shows error message when result has error', () => {
    const { getByText } = render(
      <ExerciseRenderer result={{ type: 'study_session', props: {}, error: 'Something went wrong' }} sendMessage={vi.fn()} />,
    )
    expect(getByText('Something went wrong')).toBeTruthy()
  })

  it('shows unsupported message for unknown exercise type', () => {
    const { getByText } = render(
      <ExerciseRenderer result={{ type: 'unknown_type', props: { questions } }} sendMessage={vi.fn()} />,
    )
    expect(getByText(/not yet supported/i)).toBeTruthy()
  })

  it('shows empty state when study_session has no questions', () => {
    const { getByText } = render(
      <ExerciseRenderer result={{ type: 'study_session', props: { questions: [] } }} sendMessage={vi.fn()} />,
    )
    expect(getByText(/no exercises/i)).toBeTruthy()
  })

  it('passes disableLeaveGuard to StudySession for study_session type', () => {
    capturedStudySessionProps = {}
    render(
      <ExerciseRenderer result={{ type: 'study_session', props: { questions } }} sendMessage={vi.fn()} />,
    )
    expect(capturedStudySessionProps.disableLeaveGuard).toBe(true)
  })
})
