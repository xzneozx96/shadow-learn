import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { normalizeMessagesForBackend } from './agent-utils'

describe('agent Utils Compaction Pipeline', () => {
  it('amnesia Bug: coalesceMessages should merge assistant parts, not overwrite them', () => {
    // Scenario: The agent makes a tool call, the tool result is provided, and then the agent speaks.
    const input: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What is my vocab?' }],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation', // simulated shape for vercel ai sdk tool call/result
            toolCallId: 'call_123',
            toolName: 'get_vocabulary',
            state: 'output-available',
            output: [{ id: '1', word: '你好', romanization: 'nǐ hǎo', meaning: 'hello' }],
          } as any,
        ],
      },
      {
        id: 'msg-3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Here are your words!' }],
      },
    ]

    const result = normalizeMessagesForBackend(input)

    // We expect the assistant messages to be coalesced into one.
    const assistantMsg = result.find(m => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()

    // The coalesced message should have BOTH the tool result and the text.
    const hasTool = assistantMsg?.parts.some(p => p.type === 'tool-invocation')
    const hasText = assistantMsg?.parts.some(p => p.type === 'text' && p.text === 'Here are your words!')

    expect(hasTool, 'The tool invocation was lost due to the amnesia bug').toBe(true)
    expect(hasText, 'The text response was lost').toBe(true)
  })

  it('lobotomy Bug: compactForTokenBudget should never stub GUIDANCE_TOOLS', () => {
    // Simulate a message way over budget to force compaction of old messages
    const heavyString = 'x'.repeat(64_000 * 5)

    const input: UIMessage[] = [
      {
        id: 'msg-out-of-window',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolCallId: 'call_guide',
            toolName: 'get_core_guidelines',
            state: 'output-available',
            output: { content: '# CORE GUIDELINES\nStrict Rule: Never drop this.' },
          } as any,
        ],
      },
      // Insert padding messages to push the guideline outside the verbatim tail
      { id: 'msg-pad-1', role: 'user', parts: [{ type: 'text', text: '1' }] },
      { id: 'msg-pad-2', role: 'assistant', parts: [{ type: 'text', text: '1' }] },
      { id: 'msg-pad-3', role: 'user', parts: [{ type: 'text', text: '2' }] },
      { id: 'msg-pad-4', role: 'assistant', parts: [{ type: 'text', text: '2' }] },
      { id: 'msg-pad-5', role: 'user', parts: [{ type: 'text', text: '3' }] },
      { id: 'msg-pad-6', role: 'assistant', parts: [{ type: 'text', text: '3' }] },
      { id: 'msg-heavy', role: 'user', parts: [{ type: 'text', text: heavyString }] },
    ]

    const result = normalizeMessagesForBackend(input)
    const firstMsg = result[0]
    const toolPart = firstMsg.parts[0] as any

    // Should NOT be stubbed as [get_core_guidelines result omitted]
    expect(toolPart.output).toBeTypeOf('object')
    expect(toolPart.output.content).toContain('Strict Rule: Never drop this.')
  })

  it('deduplicateDataToolResults: Only keeps the latest fetch of vocabulary', () => {
    const input: UIMessage[] = [
      {
        id: 'msg-vocab-old',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolCallId: 'call_old',
            toolName: 'get_vocabulary',
            state: 'output-available',
            output: [{ word: 'old_word' }],
          } as any,
        ],
      },
      { id: 'user-padding', role: 'user', parts: [{ type: 'text', text: 'wait' }] },
      {
        id: 'msg-vocab-new',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolCallId: 'call_new',
            toolName: 'get_vocabulary',
            state: 'output-available',
            output: [{ word: 'new_word' }],
          } as any,
        ],
      },
    ]

    const result = normalizeMessagesForBackend(input)

    const oldPart = result[0].parts[0] as any
    const newPart = result[2].parts[0] as any

    expect(oldPart.output).toEqual({ status: 'superseded' })
    expect(newPart.output).toEqual([{ word: 'new_word' }])
  })
})
