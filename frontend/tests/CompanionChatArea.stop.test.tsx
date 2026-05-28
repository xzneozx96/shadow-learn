import type { UIMessage } from '@ai-sdk/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CompanionChatArea } from '@/features/agent/ui/chat/CompanionChatArea'

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

describe('companionChatArea — streaming stop', () => {
  it('calls onStop instead of onSend when stop is clicked during streaming', async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()

    render(
      <CompanionChatArea
        messages={[]}
        isLoading
        hasMore={false}
        onLoadMore={vi.fn()}
        chips={[]}
        onRemoveChip={vi.fn()}
        onSend={onSend}
        onStop={onStop}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop/i }))

    expect(onStop).toHaveBeenCalledOnce()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders the shared unified trace path with the final assistant answer still after the trace', () => {
    const assistantWithTrace = {
      id: 'a-1',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'reasoning', text: 'I should inspect the input.', state: 'done' },
        {
          type: 'tool-render_vocab_card',
          toolName: 'render_vocab_card',
          toolCallId: 'call-1',
          state: 'output-available',
          output: { entry: { id: '1', word: 'test', meaning: 'test' } },
        },
        { type: 'text', text: 'Done.' },
      ],
    } as UIMessage

    render(
      <CompanionChatArea
        messages={[assistantWithTrace]}
        isLoading
        hasMore={false}
        onLoadMore={vi.fn()}
        chips={[]}
        onRemoveChip={vi.fn()}
        onSend={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: /thinking|reasoning|trace|chain of thought/i })).toHaveLength(1)
    expect(screen.getByText(/I should inspect the input\./i)).toBeTruthy()
    expect(screen.getByText(/vocab|render.*card/i)).toBeTruthy()
    expect(screen.getByText(/Done\./i)).toBeTruthy()
  })
})
