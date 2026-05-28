import type { UIMessage } from '@ai-sdk/react'

type MessagePart
  = NonNullable<UIMessage['parts']>[number]
    | { type: 'step-start' }

interface ToolMessagePart {
  type: string
  toolName?: string
  toolCallId?: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

export type AssistantTraceStep
  = | {
    kind: 'reasoning'
    text: string
    status: 'active' | 'complete' | 'pending'
  }
  | {
    kind: 'tool'
    toolName: string
    toolCallId: string
    status: 'pending' | 'active' | 'complete' | 'error'
    input?: unknown
    output?: unknown
    errorText?: string
  }

export interface AssistantTrace {
  steps: AssistantTraceStep[]
  hasTextAnswer: boolean
}

function isReasoningPart(
  part: MessagePart,
): part is Extract<NonNullable<UIMessage['parts']>[number], { type: 'reasoning' }> {
  return part.type === 'reasoning'
}

function isTextPart(
  part: MessagePart,
): part is Extract<NonNullable<UIMessage['parts']>[number], { type: 'text' }> {
  return part.type === 'text'
}

function isToolPart(part: MessagePart): part is MessagePart & ToolMessagePart {
  return typeof part.type === 'string' && part.type.startsWith('tool-')
}

function mapToolStatus(state: string): AssistantTraceStep['status'] {
  if (state === 'input-streaming')
    return 'pending'
  if (state === 'input-available')
    return 'active'
  if (state === 'output-error')
    return 'error'
  return 'complete'
}

function isErrorOutput(output: unknown): boolean {
  if (typeof output === 'object' && output != null && 'error' in output) {
    const err = (output as Record<string, unknown>).error
    return typeof err === 'string' && err.length > 0
  }
  return false
}

export function buildAssistantTrace(message: UIMessage, isStreaming: boolean): AssistantTrace {
  const steps: AssistantTraceStep[] = []
  const toolIndexById = new Map<string, number>()
  let reasoningBuffer: string[] = []
  let reasoningStreaming = false

  const flushReasoning = () => {
    if (reasoningBuffer.length === 0)
      return
    steps.push({
      kind: 'reasoning',
      text: reasoningBuffer.join('\n\n'),
      status: reasoningStreaming ? 'active' : 'complete',
    })
    reasoningBuffer = []
    reasoningStreaming = false
  }

  for (const part of message.parts ?? []) {
    if (part.type === 'step-start') {
      flushReasoning()
      continue
    }

    if (isReasoningPart(part)) {
      if (part.text?.trim()) {
        reasoningBuffer.push(part.text)
        if (part.state === 'streaming' || (isStreaming && message.role === 'assistant'))
          reasoningStreaming = true
      }
      continue
    }

    if (isTextPart(part)) {
      flushReasoning()
      continue
    }

    if (isToolPart(part)) {
      flushReasoning()

      const toolName = part.toolName || part.type.replace('tool-', '')
      const toolCallId = part.toolCallId || `${toolName}-${steps.length}`
      const mappedStatus = mapToolStatus(part.state)
      const finalStatus
        = mappedStatus === 'complete' && isErrorOutput(part.output) ? 'error' : mappedStatus
      const nextStep: AssistantTraceStep = {
        kind: 'tool',
        toolName,
        toolCallId,
        status: finalStatus,
        input: part.input,
        output: part.output,
        errorText: part.errorText,
      }

      const existingIndex = toolIndexById.get(toolCallId)
      if (existingIndex == null) {
        toolIndexById.set(toolCallId, steps.length)
        steps.push(nextStep)
      }
      else {
        const prev = steps[existingIndex]
        if (prev.kind === 'tool') {
          steps[existingIndex] = {
            ...prev,
            ...nextStep,
            input: nextStep.input ?? prev.input,
            output: nextStep.output ?? prev.output,
            errorText: nextStep.errorText ?? prev.errorText,
            status:
              nextStep.status === 'error'
                ? 'error'
                : nextStep.status === 'complete' && prev.status === 'error'
                  ? 'error'
                  : nextStep.status,
          }
        }
      }
    }
  }

  flushReasoning()

  return {
    steps,
    hasTextAnswer: message.parts?.some(part => isTextPart(part) && part.text.trim().length > 0) ?? false,
  }
}
