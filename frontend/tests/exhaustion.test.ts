import type { UIMessage } from '@ai-sdk/react'
import { describe, expect, it } from 'vitest'
import { computeLessonExhaustion } from '@/lib/context-assembler/exhaustion'

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
