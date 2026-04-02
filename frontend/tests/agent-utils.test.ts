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

describe('normalizeMessagesForBackend — filtering and coalescing', () => {
  it('drops empty user messages (no text, no file)', () => {
    const messages: any[] = [
      { id: 'u1', role: 'user', content: '', parts: [{ type: 'text', text: '' }] },
      { id: 'a1', role: 'assistant', content: 'hi', parts: [{ type: 'text', text: 'hi' }] },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('assistant')
  })

  it('keeps user messages with file parts even if no text', () => {
    const messages: any[] = [
      { id: 'u1', role: 'user', content: '', parts: [{ type: 'file', url: 'img.png' }] },
      { id: 'a1', role: 'assistant', content: 'ok', parts: [{ type: 'text', text: 'ok' }] },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
  })

  it('deduplicates consecutive identical user messages', () => {
    const messages: any[] = [
      { id: 'u1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] },
      { id: 'u2', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result).toHaveLength(1)
  })

  it('merges consecutive assistant tool-call messages', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [{ type: 'tool-get_vocab', toolCallId: 'c1', state: 'output-available', output: {} }],
      },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [{ type: 'tool-get_progress', toolCallId: 'c2', state: 'output-available', output: {} }],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result).toHaveLength(1)
    expect(result[0].parts).toHaveLength(2)
  })

  it('applies window limit respecting tool role boundaries', () => {
    const messages: any[] = [
      { id: 'u1', role: 'user', content: 'a', parts: [{ type: 'text', text: 'a' }] },
      { id: 'a1', role: 'assistant', content: 'b', parts: [{ type: 'text', text: 'b' }] },
      { id: 'u2', role: 'user', content: 'c', parts: [{ type: 'text', text: 'c' }] },
      { id: 'a2', role: 'assistant', content: 'd', parts: [{ type: 'text', text: 'd' }] },
      { id: 'u3', role: 'user', content: 'e', parts: [{ type: 'text', text: 'e' }] },
      { id: 'a3', role: 'assistant', content: 'f', parts: [{ type: 'text', text: 'f' }] },
    ]
    const result = normalizeMessagesForBackend(messages, 4)
    expect(result).toHaveLength(4)
    expect(result[0].content).toBe('c')
  })
})

describe('normalizeMessagesForBackend — render output summarization', () => {
  it('replaces render_study_session output with { status: rendered }', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-render_study_session',
        toolName: 'render_study_session',
        toolCallId: 'c1',
        state: 'output-available',
        output: { type: 'study_session', props: { questions: [{}, {}, {}] } },
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ status: 'rendered' })
  })

  it('replaces render_progress_chart output', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-render_progress_chart',
        toolName: 'render_progress_chart',
        toolCallId: 'c1',
        state: 'output-available',
        output: { metric: 'accuracy', data: [1, 2, 3, 4, 5] },
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ status: 'rendered' })
  })

  it('replaces render_vocab_card output', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-render_vocab_card',
        toolName: 'render_vocab_card',
        toolCallId: 'c1',
        state: 'output-available',
        output: { entry: { word: '你好', romanization: 'nǐ hǎo' } },
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ status: 'rendered' })
  })

  it('does not summarize non-render tools', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-get_vocabulary',
        toolName: 'get_vocabulary',
        toolCallId: 'c1',
        state: 'output-available',
        output: [{ word: '你好' }],
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual([{ word: '你好' }])
  })

  it('does not summarize output-error render parts', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-render_study_session',
        toolName: 'render_study_session',
        toolCallId: 'c1',
        state: 'output-error',
        errorText: 'generation failed',
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].state).toBe('output-error')
  })

  it('derives tool name from type when toolName absent (IDB-restored)', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-render_vocab_card',
        toolCallId: 'c1',
        state: 'output-available',
        output: { entry: { word: '谢谢' } },
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ status: 'rendered' })
  })
})

describe('normalizeMessagesForBackend — guidance compression', () => {
  it('keeps the latest get_core_guidelines result, stubs earlier ones', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_core_guidelines',
          toolName: 'get_core_guidelines',
          toolCallId: 'c1',
          state: 'output-available',
          output: { content: 'first load — 3K tokens of guidelines...' },
        }],
      },
      { id: 'u1', role: 'user', content: 'ok', parts: [{ type: 'text', text: 'ok' }] },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_core_guidelines',
          toolName: 'get_core_guidelines',
          toolCallId: 'c2',
          state: 'output-available',
          output: { content: 'second load — latest version' },
        }],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toBe('[loaded — not repeated]')
    expect(result[2].parts[0].output).toEqual({ content: 'second load — latest version' })
  })

  it('keeps get_skill_guide results for different calls, stubs duplicates', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_skill_guide',
          toolName: 'get_skill_guide',
          toolCallId: 'c1',
          state: 'output-available',
          output: { content: 'tones guide — first' },
        }],
      },
      { id: 'u1', role: 'user', content: 'more', parts: [{ type: 'text', text: 'more' }] },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_skill_guide',
          toolName: 'get_skill_guide',
          toolCallId: 'c2',
          state: 'output-available',
          output: { content: 'tones guide — latest' },
        }],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toBe('[loaded — not repeated]')
    expect(result[2].parts[0].output).toEqual({ content: 'tones guide — latest' })
  })

  it('does not touch guidance results if only one occurrence', () => {
    const messages: any[] = [{
      id: 'a1',
      role: 'assistant',
      content: '',
      parts: [{
        type: 'tool-get_core_guidelines',
        toolName: 'get_core_guidelines',
        toolCallId: 'c1',
        state: 'output-available',
        output: { content: 'full guidelines' },
      }],
    }]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ content: 'full guidelines' })
  })
})

describe('normalizeMessagesForBackend — data tool deduplication', () => {
  it('keeps latest get_vocabulary, stubs earlier', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_vocabulary',
          toolName: 'get_vocabulary',
          toolCallId: 'c1',
          state: 'output-available',
          output: [{ word: 'old' }],
        }],
      },
      { id: 'u1', role: 'user', content: 'again', parts: [{ type: 'text', text: 'again' }] },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [{
          type: 'tool-get_vocabulary',
          toolName: 'get_vocabulary',
          toolCallId: 'c2',
          state: 'output-available',
          output: [{ word: 'new' }],
        }],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ status: 'superseded' })
    expect(result[2].parts[0].output).toEqual([{ word: 'new' }])
  })

  it('deduplicates different data tools independently', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [
          { type: 'tool-get_vocabulary', toolName: 'get_vocabulary', toolCallId: 'c1', state: 'output-available', output: { v: 'old' } },
          { type: 'tool-get_study_context', toolName: 'get_study_context', toolCallId: 'c2', state: 'output-available', output: { s: 'old' } },
        ],
      },
      { id: 'u1', role: 'user', content: 'x', parts: [{ type: 'text', text: 'x' }] },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [
          { type: 'tool-get_vocabulary', toolName: 'get_vocabulary', toolCallId: 'c3', state: 'output-available', output: { v: 'new' } },
        ],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    const a1Parts = result[0].parts
    expect(a1Parts[0].output).toEqual({ status: 'superseded' })
    expect(a1Parts[1].output).toEqual({ s: 'old' })
    expect(result[2].parts[0].output).toEqual({ v: 'new' })
  })

  it('does not deduplicate non-data tools', () => {
    const messages: any[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [{ type: 'tool-save_memory', toolName: 'save_memory', toolCallId: 'c1', state: 'output-available', output: { id: '1' } }],
      },
      { id: 'u1', role: 'user', content: 'x', parts: [{ type: 'text', text: 'x' }] },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        parts: [{ type: 'tool-save_memory', toolName: 'save_memory', toolCallId: 'c2', state: 'output-available', output: { id: '2' } }],
      },
    ]
    const result = normalizeMessagesForBackend(messages, 10)
    expect(result[0].parts[0].output).toEqual({ id: '1' })
    expect(result[2].parts[0].output).toEqual({ id: '2' })
  })
})
