import { describe, expect, it } from 'vitest'
import { normalizeMessagesForBackend } from '@/lib/agent-utils'

describe('normalizeMessagesForBackend — guaranteeToolResultPairing', () => {
  it('injects output-error state for incomplete tool parts', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-get_study_context',
            toolCallId: 'call-1',
            toolName: 'get_study_context',
            args: {},
            state: 'input-available', // not complete
          },
        ],
      },
    ]

    const result = normalizeMessagesForBackend(messages, 10)
    const msg = result.find((m: any) => m.role === 'assistant')!
    const part = msg.parts.find((p: any) => p.toolCallId === 'call-1')!
    expect(part.state).toBe('output-error')
    expect(part.output).toEqual({ error: 'Tool call did not complete' })
  })

  it('does not modify parts with state output-available', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-get_study_context',
            toolCallId: 'call-1',
            toolName: 'get_study_context',
            args: {},
            state: 'output-available',
            output: { dueItems: [] },
          },
        ],
      },
    ]

    const result = normalizeMessagesForBackend(messages, 10)
    const msg = result.find((m: any) => m.role === 'assistant')!
    const part = msg.parts.find((p: any) => p.toolCallId === 'call-1')!
    expect(part.state).toBe('output-available')
    expect(part.output).toEqual({ dueItems: [] })
  })

  it('does not modify parts with state output-error', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-save_memory',
            toolCallId: 'call-2',
            toolName: 'save_memory',
            args: {},
            state: 'output-error',
            output: { error: 'already errored' },
          },
        ],
      },
    ]

    const result = normalizeMessagesForBackend(messages, 10)
    const msg = result.find((m: any) => m.role === 'assistant')!
    const part = msg.parts.find((p: any) => p.toolCallId === 'call-2')!
    expect(part.state).toBe('output-error')
    expect(part.output).toEqual({ error: 'already errored' })
  })

  it('handles messages with no tool parts without modification', () => {
    const messages: any[] = [
      { id: 'u1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] },
      { id: 'a1', role: 'assistant', content: 'hi', parts: [{ type: 'text', text: 'hi' }] },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result).toHaveLength(2)
    expect(result[0].parts).toHaveLength(1)
  })
})
