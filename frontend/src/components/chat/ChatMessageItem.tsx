/* eslint-disable react-refresh/only-export-components -- renderMessageParts is tightly coupled with MessageItem */
import type { UIMessage } from '@ai-sdk/react'
import type { ExerciseRenderResult } from '../lesson/ExerciseRenderer'
import { FileText } from 'lucide-react'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  getToolName,
  isToolPart,
  isWidePart,
} from '@/lib/companion-utils'
import {
  EXERCISE_TOOLS,
  SILENT_TOOLS,
} from '@/lib/tools/index'
import {
  ProgressChartRenderer,
  ToolCallCard,
  VocabCardRenderer,
} from '../lesson/AgentRenderers'
import { ExerciseRenderer } from '../lesson/ExerciseRenderer'

const CONTEXT_CHIPS_REGEX = /^Context:\n((?:> [^\n]*\n)+)\n([\s\S]*)$/
const BLOCKQUOTE_PREFIX_REGEX = /^> /

/** Parse a "Context:\n> line1\n> line2\n\nbody" prefix into chip texts + remaining body. */
function parseContextChips(text: string): { chips: string[], body: string } {
  const match = text.match(CONTEXT_CHIPS_REGEX)
  if (!match)
    return { chips: [], body: text }
  const chips = match[1].split('\n').filter(Boolean).map(l => l.replace(BLOCKQUOTE_PREFIX_REGEX, ''))
  return { chips, body: match[2] }
}

export type SendMessage = (opts: { text: string }) => void

export function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  )
}

/**
 * Render all parts of a message using AI SDK v5 part types.
 * activeWideIds: set of toolCallIds that should render as full widgets.
 * Parts not in this set collapse to compact ToolCallCards to prevent history clutter.
 */
export function renderMessageParts(msg: UIMessage, sendMessage: SendMessage, activeWideIds: ReadonlySet<string>) {
  if (!msg.parts || msg.parts.length === 0)
    return null

  return msg.parts.map((part, i) => {
    if (isToolPart(part)) {
      const partKey = part.toolCallId ?? `${part.type}-${i}`
      const toolName = getToolName(part)
      const { state } = part

      // Loading states — show ToolCallCard with running indicator
      if (state === 'input-streaming' || state === 'input-available')
        return <ToolCallCard key={partKey} toolName={toolName} state={state} input={part.input} />

      // SDK-level error
      if (state === 'output-error') {
        return (
          <ToolCallCard
            key={partKey}
            toolName={toolName}
            state="output-error"
            isError
            errorMessage={part.errorText ?? 'Tool execution failed'}
            input={part.input}
          />
        )
      }

      // Output available — render appropriate component
      if (state === 'output-available') {
        const output = part.output as unknown

        // Output not yet populated (SDK race) — show completed card as placeholder
        if (output == null)
          return <ToolCallCard key={partKey} toolName={toolName} state="output-available" input={part.input} />

        const isOutputObj = typeof output === 'object' && output !== null
        const isError = isOutputObj && ('error' in output || (output as { success?: boolean }).success === false)
        const errorMessage = isError
          ? (typeof (output as { error?: unknown }).error === 'string' ? (output as { error: string }).error : 'Tool execution failed')
          : undefined

        if (SILENT_TOOLS.has(toolName)) {
          return (
            <ToolCallCard
              key={partKey}
              toolName={toolName}
              state="output-available"
              isError={isError}
              errorMessage={errorMessage}
              input={part.input}
              output={output}
            />
          )
        }

        // Older occurrences of wide tools collapse to compact cards to avoid history clutter.
        // Use toolCallId ?? part.type (without index) to match the key used in activeWideIds.
        const wideCheckId = part.toolCallId ?? part.type
        if (!activeWideIds.has(wideCheckId)) {
          return (
            <ToolCallCard
              key={partKey}
              toolName={toolName}
              state="output-available"
              input={part.input}
            />
          )
        }

        if (EXERCISE_TOOLS.has(toolName)) {
          return (
            <ExerciseRenderer
              key={partKey}
              result={output as unknown as ExerciseRenderResult}
              sendMessage={sendMessage}
            />
          )
        }

        if (toolName === 'render_progress_chart')
          return <ProgressChartRenderer key={partKey} result={output as Parameters<typeof ProgressChartRenderer>[0]['result']} />

        if (toolName === 'render_vocab_card')
          return <VocabCardRenderer key={partKey} result={output as Parameters<typeof VocabCardRenderer>[0]['result']} />
      }

      // Unknown tool at unknown state — show generic card
      return <ToolCallCard key={partKey} toolName={toolName} state={state as 'input-available'} input={part.input} />
    }

    if (part.type === 'text') {
      const partKey = `text-${i}`
      if (msg.role === 'assistant') {
        return (
          <div key={partKey} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {part.text}
            </ReactMarkdown>
          </div>
        )
      }
      return <p key={partKey} className="whitespace-pre-wrap">{part.text}</p>
    }

    if (part.type === 'file') {
      const filePart = part as { type: 'file', url?: string, mediaType?: string, filename?: string }
      if (filePart.url && filePart.mediaType?.startsWith('image/')) {
        const imgKey = `file-${part.type}-${filePart.url.slice(-8)}`
        return (
          <img
            key={imgKey}
            src={filePart.url}
            alt={filePart.filename ?? 'Attached image'}
            className="max-h-48 max-w-full rounded-md object-contain mb-2"
          />
        )
      }
      return null
    }

    return null
  })
}

export const MessageItem = memo(
  ({ msg, sendMessage, activeWideIds }: { msg: UIMessage, sendMessage: SendMessage, activeWideIds: ReadonlySet<string> }) => {
    if (msg.role !== 'assistant') {
      // Parse context chips from user messages for visual rendering
      const textPart = msg.parts.find((p): p is { type: 'text', text: string } => p.type === 'text' && 'text' in p)
      const { chips: contextChips, body } = textPart ? parseContextChips(textPart.text) : { chips: [], body: '' }
      const hasChips = contextChips.length > 0

      return (
        <div className="flex justify-end">
          <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
            {hasChips && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {contextChips.map((chip, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-sm bg-card/15 px-1.5 py-0.5 text-xs text-primary-foreground/90"
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate max-w-[180px]">{chip}</span>
                  </span>
                ))}
              </div>
            )}
            {hasChips
              ? (
                  <>
                    {body && <p className="whitespace-pre-wrap">{body}</p>}
                    {renderMessageParts({ ...msg, parts: msg.parts.filter(p => p.type !== 'text') } as UIMessage, sendMessage, activeWideIds)}
                  </>
                )
              : renderMessageParts(msg, sendMessage, activeWideIds)}
          </div>
        </div>
      )
    }

    // Split assistant parts: text + tool indicator cards in bubble; wide parts
    // (exercises, charts, vocab cards) render full-width below.
    const parts = msg.parts
    // Tool parts before text parts so indicators show above the response text
    const bubbleParts = parts.filter(p => !isWidePart(p)).toSorted((a, b) => {
      const aIsTool = isToolPart(a) ? 0 : 1
      const bIsTool = isToolPart(b) ? 0 : 1
      return aIsTool - bIsTool
    })
    const fullWidthParts = parts.filter(isWidePart)

    const bubbleContent = renderMessageParts({ ...msg, parts: bubbleParts } as UIMessage, sendMessage, activeWideIds)
    const fullWidthContent = renderMessageParts({ ...msg, parts: fullWidthParts } as UIMessage, sendMessage, activeWideIds)
    const hasBubble = bubbleParts.some((p) => {
      if (p.type === 'text' && 'text' in p)
        return (p.text as string)?.trim()
      if (isToolPart(p))
        return true
      return false
    })

    return (
      <div className="flex flex-col gap-2 items-start w-full">
        {hasBubble && (
          <div className="flex justify-start w-full">
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm elegant-card border text-foreground">
              {bubbleContent}
            </div>
          </div>
        )}
        {fullWidthParts.length > 0 && (
          <div className="w-full text-sm space-y-2">
            {fullWidthContent}
          </div>
        )}
      </div>
    )
  },
  (prev, next) => {
    if (prev.activeWideIds !== next.activeWideIds)
      return false
    if (prev.msg.id !== next.msg.id)
      return false
    const p1 = prev.msg.parts
    const p2 = next.msg.parts
    if (p1.length !== p2.length)
      return false
    return p1.every((p, i) => {
      const nextPart = p2[i]
      if (!nextPart)
        return false
      if (p.type !== nextPart.type)
        return false
      if (p.type === 'text' && 'text' in p && 'text' in nextPart)
        return p.text === nextPart.text
      if (isToolPart(p) && isToolPart(nextPart))
        return p.state === nextPart.state && (p.output != null) === (nextPart.output != null)
      return true
    })
  },
)
