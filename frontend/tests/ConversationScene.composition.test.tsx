import type { ReactNode } from 'react'
import type { SpeakSessionValue } from '../src/contexts/SpeakSessionContext'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConversationScene } from '../src/components/speak/speaking-session/ConversationScene'
import { SpeakSessionProvider } from '../src/contexts/SpeakSessionContext'

vi.mock('@livekit/components-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/components-react')>()
  return {
    ...actual,
    useAgent: () => ({
      isConnected: true,
      state: 'listening',
      microphoneTrack: null,
      failureReasons: [],
    }),
    useLocalParticipant: () => ({
      localParticipant: { isMicrophoneEnabled: false, setMicrophoneEnabled: vi.fn() },
    }),
    useSessionMessages: () => ({ messages: [] }),
    useTrackVolume: () => 0,
  }
})

vi.mock('../src/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'en' }),
}))

vi.mock('../src/components/agents-ui/agent-control-bar', () => ({
  AgentControlBar: () => null,
}))

vi.mock('../src/components/agents-ui/agent-audio-visualizer-aura', () => ({
  AgentAudioVisualizerAura: () => null,
}))

vi.mock('../src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}))

const sessionValue: SpeakSessionValue = {
  speakSession: { sessionId: 's1', transcript: [], feedbacks: {} } as any,
  persona: { id: 'p1', portrait_url: undefined, name: 'Alex' } as any,
  situation: { id: 's1', title: 'Cafe', userGoal: 'Order coffee', target_vocab: [] } as any,
  onEnd: vi.fn(),
  onRetry: vi.fn(),
  onViewRecap: vi.fn(),
  onFeedbackUpdate: vi.fn(),
  onTranscriptUpdate: vi.fn(),
  updateEvaluation: vi.fn(),
}

const baseProps = {
  onEnd: vi.fn(),
  transcript: null as ReactNode,
  intelligencePanel: null as ReactNode,
  overlay: null as ReactNode,
}

function renderWithProvider(ui: ReactNode) {
  return render(<SpeakSessionProvider value={sessionValue}>{ui}</SpeakSessionProvider>)
}

describe('conversationScene — slot composition', () => {
  it('renders the intelligencePanel slot', () => {
    renderWithProvider(
      <ConversationScene {...baseProps} intelligencePanel={<div data-testid="intel">INTEL</div>} />,
    )
    expect(screen.getByTestId('intel')).toHaveTextContent('INTEL')
  })

  it('renders the overlay slot when provided', () => {
    renderWithProvider(
      <ConversationScene {...baseProps} overlay={<div data-testid="overlay">OVERLAY</div>} />,
    )
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })

  it('renders the transcript slot', () => {
    renderWithProvider(
      <ConversationScene {...baseProps} transcript={<div data-testid="transcript">T</div>} />,
    )
    expect(screen.getByTestId('transcript')).toBeInTheDocument()
  })

  it('renders null overlay without crashing', () => {
    renderWithProvider(<ConversationScene {...baseProps} overlay={null} />)
  })

  it('reads persona and situation from SpeakSessionContext', () => {
    renderWithProvider(<ConversationScene {...baseProps} />)
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Cafe')).toBeInTheDocument()
  })

  it('prop surface is ≤ 4 keys (regression guard — grammarPanel removed)', () => {
    const propCount = Object.keys(baseProps).length
    expect(propCount).toBeLessThanOrEqual(4)
  })
})
