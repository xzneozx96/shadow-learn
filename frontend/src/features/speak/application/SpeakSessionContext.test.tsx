import type { SpeakSession } from '@/db'
import type { Persona } from '@/shared/lib/constants'
import type { SpeakSituation } from '@/shared/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SpeakSessionProvider, useSpeakSession } from '@/features/speak/application/SpeakSessionContext'

const mockPersona: Persona = {
  id: 'p1',
  name: 'Alex',
  tagline: 'Friendly teacher',
  portrait_url: undefined,
  voice_ids: {},
  supported_languages: ['en', 'zh-CN'],
}

const mockSituation: SpeakSituation = {
  id: 's1',
  title: 'Cafe',
  userGoal: 'Order coffee',
  target_vocab: [],
}

const mockSpeakSession: SpeakSession = {
  sessionId: 'sess-1',
  lessonId: 'lesson-1',
  startedAt: '2025-01-01T10:00:00Z',
  endedAt: null,
  durationSeconds: 300,
  status: 'active',
  transcript: [],
  transcriptText: '',
  evaluation: null,
  feedbacks: {},
  promptVersion: 'v1',
  modelId: 'gpt-4',
  targetLanguage: 'zh-CN',
  proficiencyLevel: 'beginner',
  levelLabel: 'Beginner',
  situationTitle: 'Cafe',
  userGoal: 'Order coffee',
}

const baseValue = {
  speakSession: mockSpeakSession,
  persona: mockPersona,
  situation: mockSituation,
  onEnd: vi.fn(),
  onRetry: vi.fn(),
  onViewRecap: vi.fn(),
  onFeedbackUpdate: vi.fn(),
  onTranscriptUpdate: vi.fn(),
  updateEvaluation: vi.fn(),
}

function Consumer() {
  const ctx = useSpeakSession()
  return (
    <div>
      {ctx.persona.name}
      -
      {ctx.situation.title}
    </div>
  )
}

describe('speakSessionContext', () => {
  it('provides value to nested consumers', () => {
    render(
      <SpeakSessionProvider value={baseValue}>
        <Consumer />
      </SpeakSessionProvider>,
    )
    expect(screen.getByText('Alex-Cafe')).toBeInTheDocument()
  })

  it('throws a descriptive error when used outside provider', () => {
    const originalError = console.error
    console.error = vi.fn()
    expect(() => render(<Consumer />)).toThrow(/useSpeakSession must be used within SpeakSessionProvider/)
    console.error = originalError
  })

  it('exposes all required callbacks', () => {
    let captured: ReturnType<typeof useSpeakSession> | null = null
    function Capturer() {
      captured = useSpeakSession()
      return null
    }
    render(
      <SpeakSessionProvider value={baseValue}>
        <Capturer />
      </SpeakSessionProvider>,
    )
    expect(captured).toMatchObject({
      speakSession: mockSpeakSession,
      persona: mockPersona,
      situation: mockSituation,
      onEnd: baseValue.onEnd,
      onRetry: baseValue.onRetry,
      onViewRecap: baseValue.onViewRecap,
      onFeedbackUpdate: baseValue.onFeedbackUpdate,
      onTranscriptUpdate: baseValue.onTranscriptUpdate,
      updateEvaluation: baseValue.updateEvaluation,
    })
  })
})
