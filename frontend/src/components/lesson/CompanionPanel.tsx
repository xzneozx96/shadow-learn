import type { ChatMessage, Segment } from '@/types'
import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CompanionPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (content: string) => void
  activeSegment: Segment | null
  model: string
  onModelChange: (model: string) => void
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </span>
  )
}

export function CompanionPanel({
  messages,
  isStreaming,
  onSend,
  activeSegment,
  model,
  onModelChange,
}: CompanionPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
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
    <div className="flex h-full flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="text-sm font-medium text-slate-200">AI Companion</span>
        <div className="ml-auto">
          <Input
            placeholder="Model..."
            value={model}
            onChange={e => onModelChange(e.target.value)}
            className="h-6 w-48 text-xs"
          />
        </div>
      </div>

      {/* Context pill */}
      {activeSegment && (
        <div className="border-b border-slate-800 px-3 py-1.5">
          <Badge variant="outline" className="max-w-full truncate text-xs">
            {activeSegment.chinese}
          </Badge>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center py-12">
            <p className="text-center text-sm text-slate-500">
              Ask about vocabulary, grammar, or pronunciation for any segment.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-200',
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {isStreaming && messages.at(-1)?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-slate-800 px-3 py-2">
                <StreamingDots />
              </div>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input area */}
      <div className="flex gap-2 border-t border-slate-800 p-3">
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
    </div>
  )
}
