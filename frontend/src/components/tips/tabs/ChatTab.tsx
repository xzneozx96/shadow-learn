import type { UIMessage } from '@ai-sdk/react'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useTipChat } from '@/hooks/useTipChat'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

export function ChatTab({ courseId, videoId, lessonTitle, transcript, transcriptStatus }: Props) {
  const { locale } = useI18n()
  const chat = useTipChat(courseId, videoId, lessonTitle, transcript, locale === 'vi' ? 'vi' : 'en')
  const [input, setInput] = useState('')

  if (transcriptStatus === 'pending')
    return null

  if (transcriptStatus === 'unavailable') {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p className="font-bold text-foreground mb-1">AI tutor unavailable</p>
        <p>This video has no transcript and STT fallback failed. Try another lesson.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-bold text-foreground">Ask the Tutor</div>
        <div className="text-[11px] text-muted-foreground">Knows the transcript · gives hints, not answers</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" role="log" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="text-xs text-muted-foreground italic">Ask anything about this lesson.</div>
        )}
        {chat.messages.map((m: UIMessage) => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>
      <form
        className="px-4 py-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || chat.disabled)
            return
          chat.sendMessage({ text: input })
          setInput('')
        }}
      >
        <label htmlFor="tip-chat-input" className="sr-only">Ask the tutor</label>
        <div className={`flex gap-2 bg-muted border border-border rounded-lg px-3 py-2.5 ${chat.disabled ? 'opacity-50' : ''}`}>
          <input
            id="tip-chat-input"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            placeholder={chat.disabledReason ?? 'Ask anything about this lesson…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={chat.disabled}
          />
          <button
            type="submit"
            className="bg-primary text-white size-7 rounded-md flex items-center justify-center disabled:opacity-50"
            disabled={chat.disabled || !input.trim()}
            aria-label="Send message"
          >
            <Send className="size-3.5" aria-hidden />
          </button>
        </div>
        {chat.disabledReason && <div className="text-[10px] text-muted-foreground mt-2 text-center">{chat.disabledReason}</div>}
      </form>
    </div>
  )
}

function ChatMessage({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter(p => p.type === 'text')
    .map((p: any) => p.text as string)
    .join('')
  if (message.role === 'user') {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">You</div>
        <div className="text-sm text-foreground whitespace-pre-wrap">{text}</div>
      </div>
    )
  }
  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg px-3.5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">✦ Tutor</div>
      <div className="text-sm text-foreground whitespace-pre-wrap">{text}</div>
    </div>
  )
}
