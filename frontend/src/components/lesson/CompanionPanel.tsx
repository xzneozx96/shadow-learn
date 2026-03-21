import type { UIMessage } from '@ai-sdk/react'
import type { ExerciseRenderResult } from './ExerciseRenderer'
import type { Segment } from '@/types'
import { Send } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useAgentChat } from '@/hooks/useAgentChat'
import {
  EXERCISE_TOOLS,
  getToolName,
  hasVisibleContent,
  isAwaitingTextAfterTools,
  isToolPart,
  isWidePart,
  SILENT_TOOLS,
} from '@/lib/companion-utils'
import {
  ProgressChartRenderer,
  ToolCallCard,
  VocabCardRenderer,
} from './AgentRenderers'
import { ExerciseRenderer } from './ExerciseRenderer'
import { LessonWorkbookPanel } from './LessonWorkbookPanel'

interface CompanionPanelProps {
  activeSegment: Segment | null
  lessonId: string
  lessonTitle?: string
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  )
}

type SendMessage = (opts: { text: string }) => void

/**
 * Render all parts of a message using AI SDK v5 part types.
 */
function renderMessageParts(msg: UIMessage, sendMessage: SendMessage) {
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
          <div key={partKey} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {part.text}
            </ReactMarkdown>
          </div>
        )
      }
      return <p key={partKey} className="whitespace-pre-wrap">{part.text}</p>
    }

    return null
  })
}

const MessageItem = memo(
  ({ msg, sendMessage }: { msg: UIMessage, sendMessage: SendMessage }) => {
    if (msg.role !== 'assistant') {
      return (
        <div className="flex justify-end">
          <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
            {renderMessageParts(msg, sendMessage)}
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

    const bubbleContent = renderMessageParts({ ...msg, parts: bubbleParts } as UIMessage, sendMessage)
    const fullWidthContent = renderMessageParts({ ...msg, parts: fullWidthParts } as UIMessage, sendMessage)
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
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-card border text-foreground">
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

export function CompanionPanel({
  activeSegment,
  lessonId,
  lessonTitle,
}: CompanionPanelProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { entriesByLesson } = useVocabulary()
  const count = (entriesByLesson[lessonId] ?? []).length

  const { messages, isLoading, sendMessage } = useAgentChat(lessonId, activeSegment, lessonTitle)

  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>()
    return messages.filter((m) => {
      if (!hasVisibleContent(m))
        return false
      if (seen.has(m.id))
        return false
      seen.add(m.id)
      return true
    })
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading)
      return
    sendMessage({ text: trimmed })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Tabs
      defaultValue="ai"
      className="flex h-full flex-col gap-0"
    >
      <TabsList variant="line" className="w-full shrink-0 border-b border-border px-3 rounded-none h-[65px]!">
        <TabsTrigger value="ai">{t('lesson.aiCompanion')}</TabsTrigger>
        <TabsTrigger value="workbook" className="gap-1.5">
          {t('lesson.workbook')}
          {count > 0 && (
            <Badge className="px-1.5 py-0 text-xs">{count}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* AI Companion tab */}
      <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeSegment && (
          <div className="h-10 flex items-center border-b border-border px-3 py-1.5">
            <Badge variant="secondary" className="max-w-full truncate text-sm">
              {activeSegment.text}
            </Badge>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1 px-3 py-2">
          {messages.length === 0 && !isLoading && (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-center text-sm text-muted-foreground">
                {t('lesson.companionPlaceholder')}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {uniqueMessages.map((msg: UIMessage) => (
              <MessageItem key={msg.id} msg={msg} sendMessage={sendMessage} />
            ))}

            {isLoading && messages.length > 0 && (
              !hasVisibleContent(messages.at(-1)!)
              || messages.at(-1)?.role === 'user'
              || isAwaitingTextAfterTools(messages.at(-1), isLoading)
            ) && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <StreamingDots />
                </div>
              </div>
            )}

          </div>

          <div ref={bottomRef} className="h-px" />
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border p-3 h-16">
          <Textarea
            placeholder={t('lesson.askAboutSegment')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-8 resize-none"
          />
          <Button
            size="icon"
            aria-label="Send message"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </TabsContent>

      {/* Workbook tab */}
      <TabsContent value="workbook" className="min-h-0 flex-1 overflow-hidden">
        <LessonWorkbookPanel lessonId={lessonId} />
      </TabsContent>
    </Tabs>
  )
}
