import type { ChatMessage, Segment } from '@/types'
import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useVocabulary } from '@/hooks/useVocabulary'
import { cn } from '@/lib/utils'
import { LessonWorkbookPanel } from './LessonWorkbookPanel'

interface CompanionPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (content: string) => void
  activeSegment: Segment | null
  lessonId: string
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

export function CompanionPanel({
  messages,
  isStreaming,
  onSend,
  activeSegment,
  lessonId,
}: CompanionPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { entriesByLesson } = useVocabulary()
  const count = (entriesByLesson[lessonId] ?? []).length

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming)
      return
    onSend(trimmed)
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
        <TabsTrigger value="ai">AI Companion</TabsTrigger>
        <TabsTrigger value="workbook" className="gap-1.5">
          Workbook
          {count > 0 && (
            <Badge className="px-1.5 py-0 text-[10px]">{count}</Badge>
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
          {messages.length === 0 && !isStreaming && (
            <div className="flex h-full items-center justify-center py-12">
              <p className="text-center text-sm text-muted-foreground">
                Ask about vocabulary, grammar, or pronunciation for any segment.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {messages.map(msg => (
              <div
                key={`${msg.role}-${msg.timestamp}`}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-foreground',
                  )}
                >
                  {msg.role === 'assistant'
                    ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )
                    : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                </div>
              </div>
            ))}

            {isStreaming && messages.at(-1)?.role !== 'assistant' && (
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
            placeholder="Ask about this segment..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-8 resize-none"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
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
