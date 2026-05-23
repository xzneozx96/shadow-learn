import type { UIMessage } from '@ai-sdk/react'
import { describe, expect, it } from 'vitest'
import { computeLessonExhaustion } from '@/features/agent/lib/context-assembler/exhaustion'

function user(id: string, text: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] } as any
}
function asst(id: string, toolNames: string[]): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: toolNames.length === 0
      ? [{ type: 'text', text: 'ok' }]
      : toolNames.map((name, i) => ({
          type: `tool-${name}`,
          toolName: name,
          toolCallId: `${id}-${i}`,
          state: 'output-available',
          input: {},
          output: 'ok',
        })),
  } as any
}
function asstV6(id: string, toolTypes: string[]): UIMessage {
  // Mimics AI SDK v6 part shape: toolName encoded only in `type`, no separate field
  return {
    id,
    role: 'assistant',
    parts: toolTypes.map((name, i) => ({
      type: `tool-${name}`,
      toolCallId: `${id}-${i}`,
      state: 'output-available',
      input: {},
      output: 'ok',
    })),
  } as any
}

describe('computeLessonExhaustion', () => {
  it('returns zeros when no user message present', () => {
    expect(computeLessonExhaustion([], { maxRounds: 5 })).toEqual({
      exhausted: false,
      sameToolLoop: false,
      roundsSinceUser: 0,
    })
  })

  it('counts tool-rounds since last user message only', () => {
    const msgs = [
      user('u0', 'hi'),
      asst('a0', ['lookup']),
      user('u1', 'again'),
      asst('a1', ['lookup']),
      asst('a2', ['translate']),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(2)
    expect(res.sameToolLoop).toBe(false)
    expect(res.exhausted).toBe(false)
  })

  it('flags exhausted when rounds >= maxRounds', () => {
    const msgs: UIMessage[] = [user('u', 'go')]
    for (let i = 0; i < 5; i++) msgs.push(asst(`a${i}`, ['lookup']))
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(5)
    expect(res.exhausted).toBe(true)
  })

  it('flags sameToolLoop when two consecutive identical tool-sets', () => {
    const msgs = [
      user('u', 'go'),
      asst('a1', ['lookup', 'translate']),
      asst('a2', ['lookup', 'translate']),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.sameToolLoop).toBe(true)
    expect(res.exhausted).toBe(true)
  })

  it('does not flag sameToolLoop when tool sets differ', () => {
    const msgs = [
      user('u', 'go'),
      asst('a1', ['lookup']),
      asst('a2', ['translate']),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.sameToolLoop).toBe(false)
    expect(res.exhausted).toBe(false)
  })

  it('ignores assistant messages without tool parts', () => {
    const msgs = [
      user('u', 'go'),
      asst('a1', []),
      asst('a2', ['lookup']),
    ]
    expect(computeLessonExhaustion(msgs, { maxRounds: 5 }).roundsSinceUser).toBe(1)
  })

  it('counts tool rounds when toolName is encoded in type (v6 SDK shape)', () => {
    const msgs = [
      user('u', 'go'),
      asstV6('a1', ['lookup', 'translate']),
      asstV6('a2', ['lookup', 'translate']),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(2)
    expect(res.sameToolLoop).toBe(true)
    expect(res.exhausted).toBe(true)
  })

  it('handles mixed shapes (v5 field + v6 type-only)', () => {
    const msgs = [
      user('u', 'go'),
      asst('a1', ['lookup']),
      asstV6('a2', ['lookup']),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(2)
    expect(res.sameToolLoop).toBe(true)
  })
})

function stitchedAsst(id: string, steps: Array<Array<{ name: string, input?: unknown }>>): UIMessage {
  const parts: any[] = []
  for (const step of steps) {
    parts.push({ type: 'step-start' })
    for (const tool of step) {
      parts.push({
        type: `tool-${tool.name}`,
        toolCallId: `${id}-${tool.name}-${Math.random()}`,
        state: 'output-available',
        input: tool.input ?? {},
        output: 'ok',
      })
    }
    parts.push({ type: 'text', text: '' })
  }
  return { id, role: 'assistant', parts } as any
}

describe('computeLessonExhaustion (v6 stitched shape)', () => {
  it('counts step-start parts as rounds within a stitched message', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'tool_search' }],
        [{ name: 'tool_search' }],
        [{ name: 'get_core_guidelines' }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(3)
  })

  it('flags exhausted when stitched rounds >= maxRounds', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'tool_search' }],
        [{ name: 'tool_search' }],
        [{ name: 'tool_search' }],
        [{ name: 'tool_search' }],
        [{ name: 'tool_search' }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(5)
    expect(res.exhausted).toBe(true)
  })

  it('distinguishes same tool with different args as different fingerprints', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'tool_search', input: { query: 'a' } }],
        [{ name: 'tool_search', input: { query: 'b' } }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.sameToolLoop).toBe(false)
    expect(res.exhausted).toBe(false)
  })

  it('flags sameToolLoop when same tool called with SAME args twice in a row', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'tool_search', input: { query: 'a', max: 1 } }],
        [{ name: 'tool_search', input: { max: 1, query: 'a' } }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.sameToolLoop).toBe(true)
    expect(res.exhausted).toBe(true)
  })

  it('ignores text-only steps (no tool parts) toward round count', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'tool_search' }],
        [],
        [{ name: 'get_vocabulary' }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.roundsSinceUser).toBe(2)
  })

  it('handles multiple tools within one step as a single fingerprint set', () => {
    const msgs = [
      user('u', 'go'),
      stitchedAsst('a', [
        [{ name: 'get_study_context' }, { name: 'get_vocabulary', input: { id: 'x' } }],
        [{ name: 'get_study_context' }, { name: 'get_vocabulary', input: { id: 'x' } }],
      ]),
    ]
    const res = computeLessonExhaustion(msgs, { maxRounds: 5 })
    expect(res.sameToolLoop).toBe(true)
  })
})
