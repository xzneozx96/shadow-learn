import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { estimateTokens, isOverflow, normalizeMessagesForBackend, pruneToFit, readUsageTokens, USABLE } from '@/features/agent/lib/agent-utils'

/**
 * Build a UIMessage for tests. Parts often carry extra fields (toolName, args)
 * that the real SDK union doesn't surface on ToolUIPart, so we cast loosely.
 */
function msg(overrides: { id: string, role: UIMessage['role'], parts: Record<string, unknown>[] }): UIMessage {
  return overrides as unknown as UIMessage
}

/** Cast a message part to a loose record for asserting tool-specific fields. */
function part(m: UIMessage, index = 0): Record<string, unknown> {
  return m.parts[index] as Record<string, unknown>
}

describe('normalizeMessagesForBackend — guaranteeToolResultPairing', () => {
  it('injects output-error state for incomplete tool parts', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-get_study_context',
            toolCallId: 'call-1',
            toolName: 'get_study_context',
            args: {},
            state: 'input-available',
          },
        ],
      }),
    ]

    const result = normalizeMessagesForBackend(messages)
    const p = part(result.find(m => m.role === 'assistant')!)
    expect(p.state).toBe('output-error')
    expect(p.errorText).toBe('Tool call did not complete')
  })

  it('does not modify parts with state output-available', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
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
      }),
    ]

    const result = normalizeMessagesForBackend(messages)
    const p = part(result.find(m => m.role === 'assistant')!)
    expect(p.state).toBe('output-available')
    expect(p.output).toEqual({ dueItems: [] })
  })

  it('does not modify parts with state output-error', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-save_memory',
            toolCallId: 'call-2',
            toolName: 'save_memory',
            args: {},
            state: 'output-error',
            errorText: 'already errored',
          },
        ],
      }),
    ]

    const result = normalizeMessagesForBackend(messages)
    const p = part(result.find(m => m.role === 'assistant')!)
    expect(p.state).toBe('output-error')
    expect(p.errorText).toBe('already errored')
  })

  it('handles messages with no tool parts without modification', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
      msg({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(2)
    expect(result[0].parts).toHaveLength(1)
  })
})

describe('normalizeMessagesForBackend — filtering and coalescing', () => {
  it('drops empty user messages (no text, no file)', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: '' }] }),
      msg({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('assistant')
  })

  it('keeps user messages with file parts even if no text', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', parts: [{ type: 'file', url: 'img.png' }] }),
      msg({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
  })

  it('deduplicates consecutive identical user messages', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
      msg({ id: 'u2', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(1)
  })

  it('merges consecutive assistant tool-call messages', () => {
    const messages = [
      msg({ id: 'a1', role: 'assistant', parts: [{ type: 'tool-get_vocab', toolCallId: 'c1', state: 'output-available', output: {} }] }),
      msg({ id: 'a2', role: 'assistant', parts: [{ type: 'tool-get_progress', toolCallId: 'c2', state: 'output-available', output: {} }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(1)
    expect(result[0].parts).toHaveLength(2)
  })

  it('preserves all messages when under token budget', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'a' }] }),
      msg({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'b' }] }),
      msg({ id: 'u2', role: 'user', parts: [{ type: 'text', text: 'c' }] }),
      msg({ id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'd' }] }),
      msg({ id: 'u3', role: 'user', parts: [{ type: 'text', text: 'e' }] }),
      msg({ id: 'a3', role: 'assistant', parts: [{ type: 'text', text: 'f' }] }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(result).toHaveLength(6)
  })
})

describe('normalizeMessagesForBackend — render output summarization', () => {
  it('replaces render_study_session output with { status: rendered }', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-render_study_session',
        toolName: 'render_study_session',
        toolCallId: 'c1',
        state: 'output-available',
        output: { type: 'study_session', props: { questions: [{}, {}, {}] } },
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ status: 'rendered' })
  })

  it('replaces render_progress_chart output', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-render_progress_chart',
        toolName: 'render_progress_chart',
        toolCallId: 'c1',
        state: 'output-available',
        output: { metric: 'accuracy', data: [1, 2, 3, 4, 5] },
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ status: 'rendered' })
  })

  it('replaces render_vocab_card output', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-render_vocab_card',
        toolName: 'render_vocab_card',
        toolCallId: 'c1',
        state: 'output-available',
        output: { entry: { word: '你好', romanization: 'nǐ hǎo' } },
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ status: 'rendered' })
  })

  it('does not summarize non-render tools', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-get_vocabulary',
        toolName: 'get_vocabulary',
        toolCallId: 'c1',
        state: 'output-available',
        output: [{ word: '你好' }],
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual([{ word: '你好' }])
  })

  it('does not summarize output-error render parts', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-render_study_session',
        toolName: 'render_study_session',
        toolCallId: 'c1',
        state: 'output-error',
        errorText: 'generation failed',
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).state).toBe('output-error')
  })

  it('derives tool name from type when toolName absent (IDB-restored)', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-render_vocab_card',
        toolCallId: 'c1',
        state: 'output-available',
        output: { entry: { word: '谢谢' } },
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ status: 'rendered' })
  })
})

describe('normalizeMessagesForBackend — guidance compression', () => {
  it('keeps the latest get_core_guidelines result, stubs earlier ones', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [{
          type: 'tool-get_core_guidelines',
          toolName: 'get_core_guidelines',
          toolCallId: 'c1',
          state: 'output-available',
          output: { content: 'first load — 3K tokens of guidelines...' },
        }],
      }),
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'ok' }] }),
      msg({
        id: 'a2',
        role: 'assistant',
        parts: [{
          type: 'tool-get_core_guidelines',
          toolName: 'get_core_guidelines',
          toolCallId: 'c2',
          state: 'output-available',
          output: { content: 'second load — latest version' },
        }],
      }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toBe('[loaded — not repeated]')
    expect(part(result[2]).output).toEqual({ content: 'second load — latest version' })
  })

  it('keeps get_skill_guide results for different calls, stubs duplicates', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [{
          type: 'tool-get_skill_guide',
          toolName: 'get_skill_guide',
          toolCallId: 'c1',
          state: 'output-available',
          output: { content: 'tones guide — first' },
        }],
      }),
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'more' }] }),
      msg({
        id: 'a2',
        role: 'assistant',
        parts: [{
          type: 'tool-get_skill_guide',
          toolName: 'get_skill_guide',
          toolCallId: 'c2',
          state: 'output-available',
          output: { content: 'tones guide — latest' },
        }],
      }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toBe('[loaded — not repeated]')
    expect(part(result[2]).output).toEqual({ content: 'tones guide — latest' })
  })

  it('does not touch guidance results if only one occurrence', () => {
    const messages = [msg({
      id: 'a1',
      role: 'assistant',
      parts: [{
        type: 'tool-get_core_guidelines',
        toolName: 'get_core_guidelines',
        toolCallId: 'c1',
        state: 'output-available',
        output: { content: 'full guidelines' },
      }],
    })]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ content: 'full guidelines' })
  })
})

describe('normalizeMessagesForBackend — data tool deduplication', () => {
  it('keeps latest get_vocabulary, stubs earlier', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [{
          type: 'tool-get_vocabulary',
          toolName: 'get_vocabulary',
          toolCallId: 'c1',
          state: 'output-available',
          output: [{ word: 'old' }],
        }],
      }),
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'again' }] }),
      msg({
        id: 'a2',
        role: 'assistant',
        parts: [{
          type: 'tool-get_vocabulary',
          toolName: 'get_vocabulary',
          toolCallId: 'c2',
          state: 'output-available',
          output: [{ word: 'new' }],
        }],
      }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ status: 'superseded' })
    expect(part(result[2]).output).toEqual([{ word: 'new' }])
  })

  it('deduplicates different data tools independently', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'tool-get_vocabulary', toolName: 'get_vocabulary', toolCallId: 'c1', state: 'output-available', output: { v: 'old' } },
          { type: 'tool-get_study_context', toolName: 'get_study_context', toolCallId: 'c2', state: 'output-available', output: { s: 'old' } },
        ],
      }),
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'x' }] }),
      msg({
        id: 'a2',
        role: 'assistant',
        parts: [
          { type: 'tool-get_vocabulary', toolName: 'get_vocabulary', toolCallId: 'c3', state: 'output-available', output: { v: 'new' } },
        ],
      }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0], 0).output).toEqual({ status: 'superseded' })
    expect(part(result[0], 1).output).toEqual({ s: 'old' })
    expect(part(result[2]).output).toEqual({ v: 'new' })
  })

  it('does not deduplicate non-data tools', () => {
    const messages = [
      msg({
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool-save_memory', toolName: 'save_memory', toolCallId: 'c1', state: 'output-available', output: { id: '1' } }],
      }),
      msg({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'x' }] }),
      msg({
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'tool-save_memory', toolName: 'save_memory', toolCallId: 'c2', state: 'output-available', output: { id: '2' } }],
      }),
    ]
    const result = normalizeMessagesForBackend(messages)
    expect(part(result[0]).output).toEqual({ id: '1' })
    expect(part(result[2]).output).toEqual({ id: '2' })
  })
})

describe('estimateTokens', () => {
  it('estimates tokens from message content', () => {
    const messages = [
      msg({ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello world' }] }),
    ]
    const tokens = estimateTokens(messages)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(100)
  })

  it('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0)
  })

  it('counts large tool result content heavily', () => {
    const small = [msg({ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] })]
    const large = [msg({
      id: '2',
      role: 'assistant',
      parts: [{
        type: 'tool-get_core_guidelines',
        toolName: 'get_core_guidelines',
        state: 'output-available',
        output: 'x'.repeat(4000),
      }],
    })]
    expect(estimateTokens(large)).toBeGreaterThan(estimateTokens(small) * 5)
  })
})

describe('readUsageTokens', () => {
  it('reads canonical camelCase metadata.usage.totalTokens', () => {
    expect(readUsageTokens({ metadata: { usage: { totalTokens: 22889 } } })).toBe(22889)
  })

  it('accepts snake_case total_tokens (raw OpenRouter shape)', () => {
    expect(readUsageTokens({ metadata: { usage: { total_tokens: 22889 } } })).toBe(22889)
  })

  it('falls back to promptTokens when total is absent', () => {
    expect(readUsageTokens({ metadata: { usage: { promptTokens: 22213 } } })).toBe(22213)
    expect(readUsageTokens({ metadata: { usage: { prompt_tokens: 22213 } } })).toBe(22213)
  })

  it('reads usage placed directly on metadata', () => {
    expect(readUsageTokens({ metadata: { totalTokens: 100 } })).toBe(100)
  })

  it('returns undefined when absent or non-numeric (→ estimate fallback)', () => {
    expect(readUsageTokens({})).toBeUndefined()
    expect(readUsageTokens(null)).toBeUndefined()
    expect(readUsageTokens({ metadata: {} })).toBeUndefined()
    expect(readUsageTokens({ metadata: { usage: { totalTokens: 0 } } })).toBeUndefined()
    expect(readUsageTokens({ metadata: { usage: { totalTokens: 'x' } } })).toBeUndefined()
  })
})

describe('isOverflow', () => {
  it('true iff tokens reach the usable budget', () => {
    expect(isOverflow(USABLE - 1)).toBe(false)
    expect(isOverflow(USABLE)).toBe(true)
    expect(isOverflow(USABLE + 1)).toBe(true)
  })

  it('honours an explicit budget', () => {
    expect(isOverflow(100, 200)).toBe(false)
    expect(isOverflow(200, 200)).toBe(true)
  })
})

describe('pruneToFit', () => {
  it('returns messages unchanged when under budget', () => {
    const messages = [
      msg({ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }),
      msg({ id: '2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }),
    ]
    expect(pruneToFit(messages, 10000, 6)).toEqual(messages)
  })

  it('stubs tool results in older messages when over budget, keeps protected tail full', () => {
    const messages = [
      msg({
        id: '1',
        role: 'assistant',
        parts: [{
          type: 'tool-get_vocabulary',
          toolName: 'get_vocabulary',
          state: 'output-available',
          output: JSON.stringify({ items: 'x'.repeat(5000) }),
        }],
      }),
      msg({ id: '2', role: 'user', parts: [{ type: 'text', text: 'thanks' }] }),
      msg({ id: '3', role: 'assistant', parts: [{ type: 'text', text: 'response' }] }),
      msg({ id: '4', role: 'user', parts: [{ type: 'text', text: 'next' }] }),
    ]
    const result = pruneToFit(messages, 500, 2)
    // Never deletes — length unchanged
    expect(result.length).toBe(messages.length)
    // Protected tail kept verbatim
    expect(result.at(-1)).toEqual(messages.at(-1))
    expect(result.at(-2)).toEqual(messages.at(-2))
    // Old tool result stubbed
    expect(part(result[0] as UIMessage).output).not.toContain('x'.repeat(100))
  })

  it('never stubs guidance tools', () => {
    const messages = [
      msg({
        id: '1',
        role: 'assistant',
        parts: [{
          type: 'tool-get_core_guidelines',
          toolName: 'get_core_guidelines',
          state: 'output-available',
          output: 'CORE RULES '.repeat(500),
        }],
      }),
      msg({ id: '2', role: 'user', parts: [{ type: 'text', text: 'hi' }] }),
      msg({ id: '3', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] }),
    ]
    const result = pruneToFit(messages, 100, 1)
    expect(result.length).toBe(messages.length)
    expect(part(result[0] as UIMessage).output).toContain('CORE RULES')
  })

  it('preserves user and assistant text in older messages', () => {
    const messages = [
      msg({ id: '1', role: 'user', parts: [{ type: 'text', text: 'important question' }] }),
      msg({
        id: '2',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'important answer' },
          { type: 'tool-get_vocabulary', toolName: 'get_vocabulary', state: 'output-available', output: 'x'.repeat(3000) },
        ],
      }),
      msg({ id: '3', role: 'user', parts: [{ type: 'text', text: 'follow-up' }] }),
    ]
    const result = pruneToFit(messages, 500, 1)
    expect(part(result[0] as UIMessage).text).toBe('important question')
    const assistantParts = (result[1] as any).parts
    expect(assistantParts.find((p: any) => p.type === 'text')?.text).toBe('important answer')
    expect(assistantParts.find((p: any) => p.type?.startsWith('tool-'))?.output).not.toContain('x'.repeat(100))
  })
})
