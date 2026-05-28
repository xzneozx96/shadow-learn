import type { UIMessage } from '@ai-sdk/react'
import { describe, expect, it } from 'vitest'
import { buildAssistantTrace } from '@/features/agent/ui/chat/assistant-trace'

function makeAssistantMessage(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    parts,
  } as UIMessage
}

describe('buildAssistantTrace', () => {
  it('groups consecutive reasoning parts into one active reasoning step while streaming', () => {
    const msg = makeAssistantMessage([
      { type: 'reasoning', text: 'First thought.', state: 'streaming' },
      { type: 'reasoning', text: 'Second thought.', state: 'done' },
      { type: 'text', text: 'Final answer.' },
    ] as UIMessage['parts'])

    const trace = buildAssistantTrace(msg, true)

    expect(trace.steps).toHaveLength(1)
    expect(trace.steps[0]).toMatchObject({
      kind: 'reasoning',
      text: 'First thought.\n\nSecond thought.',
      status: 'active',
    })
    expect(trace.hasTextAnswer).toBe(true)
  })

  it('merges a tool call in place as later parts arrive', () => {
    const pendingMsg = makeAssistantMessage([
      { type: 'reasoning', text: 'I should search.', state: 'done' },
      {
        type: 'tool-search_profiles',
        toolName: 'search_profiles',
        toolCallId: 'call-1',
        state: 'input-streaming',
        input: { query: 'Hayden Bleasel' },
      },
    ] as UIMessage['parts'])

    const pendingTrace = buildAssistantTrace(pendingMsg, true)
    expect(pendingTrace.steps).toHaveLength(2)
    expect(pendingTrace.steps[1]).toMatchObject({
      kind: 'tool',
      toolName: 'search_profiles',
      status: 'pending',
    })

    const completeMsg = makeAssistantMessage([
      { type: 'reasoning', text: 'I should search.', state: 'done' },
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
      { type: 'text', text: 'Here is the answer.' },
    ] as UIMessage['parts'])

    const trace = buildAssistantTrace(completeMsg, false)

    expect(trace.steps.map(step => step.kind)).toEqual(['reasoning', 'tool'])
    expect(trace.steps[1]).toMatchObject({
      kind: 'tool',
      toolName: 'search_profiles',
      status: 'complete',
      output: { results: ['x.com', 'github.com'] },
    })
    expect(trace.hasTextAnswer).toBe(true)
  })
})
