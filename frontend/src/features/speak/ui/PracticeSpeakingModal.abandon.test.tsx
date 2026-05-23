import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PracticeSpeakingModal } from '@/features/speak/ui/PracticeSpeakingModal'
import { captureSpeakSessionAbandoned } from '@/shared/lib/posthog-events'

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
vi.mock('@/features/speak/application/useSpeakSession', () => ({
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
vi.mock('@/shared/lib/posthog-events', () => ({
  captureSpeakSessionAbandoned: vi.fn(),
  captureSpeakPersonaSelected: vi.fn(),
  captureSpeakSessionCompleted: vi.fn(),
  captureSpeakSessionStarted: vi.fn(),
  captureSpeakSituationSelected: vi.fn(),
}))
vi.mock('@/features/speak/adapters/speak-evaluation', () => ({ fetchSessionEvaluation: vi.fn() }))

describe('practiceSpeakingModal abandon tracking', () => {
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
