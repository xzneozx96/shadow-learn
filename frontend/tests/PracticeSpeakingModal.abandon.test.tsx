import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock heavy deps
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => undefined,
  useSession: () => ({ start: vi.fn(), end: vi.fn(), isConnected: false }),
  useSessionMessages: () => ({ messages: [] }),
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ keys: { googleRealtimeKey: 'test' }, db: null }),
}))
vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'en' }),
}))
vi.mock('@/hooks/useSpeakSession', () => ({
  useSpeakSession: () => ({
    currentSession: null,
    startSession: vi.fn(),
    endSession: vi.fn(),
    clearSession: vi.fn(),
    updateTranscript: vi.fn(),
    updateFeedback: vi.fn(),
    updateEvaluation: vi.fn(),
  }),
}))
vi.mock('@/db', () => ({ getSettings: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/posthog-events', () => ({
  captureSpeakSessionAbandoned: vi.fn(),
  captureSpeakPersonaSelected: vi.fn(),
  captureSpeakSessionCompleted: vi.fn(),
  captureSpeakSessionStarted: vi.fn(),
  captureSpeakSituationSelected: vi.fn(),
}))
vi.mock('@/lib/speak-evaluation', () => ({ fetchSessionEvaluation: vi.fn() }))

import { act } from '@testing-library/react'
import { PracticeSpeakingModal } from '@/components/speak/PracticeSpeakingModal'
import { captureSpeakSessionAbandoned } from '@/lib/posthog-events'

describe('PracticeSpeakingModal abandon tracking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not fire abandon on initial mount with open=true', () => {
    render(<PracticeSpeakingModal open onClose={vi.fn()} />)
    expect(captureSpeakSessionAbandoned).not.toHaveBeenCalled()
  })

  it('does not fire abandon on initial mount with open=false', () => {
    render(<PracticeSpeakingModal open={false} onClose={vi.fn()} />)
    expect(captureSpeakSessionAbandoned).not.toHaveBeenCalled()
  })

  it('does not fire abandon when transitioning from closed to open', async () => {
    const { rerender } = render(<PracticeSpeakingModal open={false} onClose={vi.fn()} />)
    await act(async () => {
      rerender(<PracticeSpeakingModal open onClose={vi.fn()} />)
    })
    expect(captureSpeakSessionAbandoned).not.toHaveBeenCalled()
  })

  it('does not fire abandon on open→closed when there is no active session (currentSession is null)', async () => {
    // currentSession is null in our mock — so even though open→closed fires the effect,
    // handleAbandonedSession guards on (currentSession && step === 'active') and returns early.
    const { rerender } = render(<PracticeSpeakingModal open onClose={vi.fn()} />)
    await act(async () => {
      rerender(<PracticeSpeakingModal open={false} onClose={vi.fn()} />)
    })
    expect(captureSpeakSessionAbandoned).not.toHaveBeenCalled()
  })
})
