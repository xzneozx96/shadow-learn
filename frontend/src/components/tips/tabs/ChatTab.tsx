import type { UIMessage } from '@ai-sdk/react'
import { MessageSquareDashed } from 'lucide-react'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { useI18n } from '@/contexts/I18nContext'
import { useTipChat } from '@/hooks/useTipChat'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
}

const MemoMarkdown = memo(({ text }: { text: string }) => (
  <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
))

function messageText(message: UIMessage): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map((p: any) => p.text as string)
    .join('')
}

export function ChatTab({ courseId, videoId, lessonTitle, transcript, transcriptStatus }: Props) {
  const { locale } = useI18n()
  const chat = useTipChat(courseId, videoId, lessonTitle, transcript, locale === 'vi' ? 'vi' : 'en')

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
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="text-sm font-bold text-foreground">Ask the Tutor</div>
        <div className="text-[11px] text-muted-foreground">Knows the transcript · gives hints, not answers</div>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {chat.messages.length === 0
            ? (
                <ConversationEmptyState
                  icon={<MessageSquareDashed className="size-8" />}
                  title="Ask anything about this lesson"
                  description="The tutor has the transcript. Ask for a summary, a drill, or a tone check."
                />
              )
            : (
                chat.messages.map(m => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent>
                      <MemoMarkdown text={messageText(m)} />
                    </MessageContent>
                  </Message>
                ))
              )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={({ text }) => {
          const trimmed = text.trim()
          if (!trimmed || chat.disabled)
            return
          chat.sendMessage({ text: trimmed })
        }}
        className="shrink-0 border-t border-border"
      >
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={chat.disabledReason ?? 'Ask anything about this lesson…'}
            disabled={chat.disabled}
          />
          <PromptInputFooter>
            <div className="flex-1" />
            <PromptInputSubmit status={chat.status} disabled={chat.disabled} />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}
