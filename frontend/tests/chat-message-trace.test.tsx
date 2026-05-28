import type { UIMessage } from '@ai-sdk/react'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MessageItem } from '@/features/agent/ui/chat/ChatMessageItem'

vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

beforeAll(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as any
})

function makeAssistantMessage(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    parts,
  } as UIMessage
}

describe('messageItem unified trace', () => {
  it('renders one open trace with grouped reasoning, ordered tool steps, and the final answer after the trace while streaming', () => {
    const msg = makeAssistantMessage([
      { type: 'reasoning', text: 'First thought.', state: 'streaming' },
      { type: 'reasoning', text: 'Second thought.', state: 'done' },
      {
        type: 'tool-search_profiles',
        toolName: 'search_profiles',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { query: 'Hayden Bleasel' },
      },
      {
        type: 'tool-search_profiles',
        toolName: 'search_profiles',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { query: 'Hayden Bleasel' },
        output: { results: ['x.com', 'github.com'] },
      },
      { type: 'text', text: 'Found it.' },
    ] as UIMessage['parts'])

    const { container } = render(
      <MessageItem
        msg={msg}
        sendMessage={vi.fn()}
        activeWideIds={new Set()}
        isLast
        isStreaming
      />,
    )

    const traceTriggers = screen.getAllByRole('button', { name: /thinking|reasoning|trace|chain of thought/i })
    expect(traceTriggers).toHaveLength(1)
    expect(traceTriggers[0]).toHaveAttribute('aria-expanded', 'true')

    expect(screen.getByText(/First thought\./i)).toBeTruthy()
    expect(screen.getByText(/Second thought\./i)).toBeTruthy()
    expect(screen.getAllByText(/search_profiles/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Found it\./i)).toBeTruthy()

    const text = container.textContent ?? ''
    const reasoningIndex = text.indexOf('First thought.')
    const toolIndex = text.indexOf('search_profiles')
    const answerIndex = text.indexOf('Found it.')

    expect(reasoningIndex).toBeGreaterThanOrEqual(0)
    expect(toolIndex).toBeGreaterThan(reasoningIndex)
    expect(answerIndex).toBeGreaterThan(toolIndex)
  })
})
