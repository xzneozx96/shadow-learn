import type { ReceivedMessage } from '@livekit/components-react'
import type { AiTurnTranslation } from '../src/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentChatTranscript } from '../src/components/agents-ui/agent-chat-transcript'

function fakeAgentMessage(id: string, text: string): ReceivedMessage {
  return {
    id,
    message: text,
    timestamp: Date.now(),
    from: { isLocal: false, identity: 'agent', name: 'Agent', kind: 2, permissions: undefined, metadata: undefined, sid: 'sid', attributes: {} },
    topic: undefined,
    transcription: undefined,
    attachedFiles: undefined,
  } as unknown as ReceivedMessage
}

describe('AgentChatTranscript — translation rendering', () => {
  it('renders translation and romanization below AI bubble', () => {
    const messages = [fakeAgentMessage('id1', '你好')]
    const translations: Record<string, AiTurnTranslation> = {
      id1: { type: 'ai-turn-translation', transcript: '你好', translation: 'Hello', romanization: 'nǐ hǎo' },
    }
    render(<AgentChatTranscript messages={messages} aiTurnTranslations={translations} />)
    expect(screen.getByText('nǐ hǎo')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders no translation section when aiTurnTranslations is empty', () => {
    const messages = [fakeAgentMessage('id1', '你好')]
    render(<AgentChatTranscript messages={messages} />)
    expect(screen.queryByText('nǐ hǎo')).not.toBeInTheDocument()
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })

  it('omits romanization row when romanization is empty string', () => {
    const translations: Record<string, AiTurnTranslation> = {
      id1: { type: 'ai-turn-translation', transcript: 'Hello', translation: 'Xin chào', romanization: '' },
    }
    const { container } = render(<AgentChatTranscript messages={[fakeAgentMessage('id1', 'Hello')]} aiTurnTranslations={translations} />)
    expect(screen.getByText('Xin chào')).toBeInTheDocument()
    // Only the italic translation paragraph should render — no romanization mono row
    expect(container.querySelector('p.font-mono')).toBeNull()
  })
})
