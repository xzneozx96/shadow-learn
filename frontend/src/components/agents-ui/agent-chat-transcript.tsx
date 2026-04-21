import type { AgentState, ReceivedMessage } from '@livekit/components-react'
import type { ComponentProps } from 'react'
import type { GrammarFeedback } from '@/types'
import { InfoIcon } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { cn } from '@/lib/utils'

const LOCALE = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
const EMPTY_FEEDBACKS: Record<string, GrammarFeedback> = {}

export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  agentState?: AgentState
  messages?: ReceivedMessage[]
  feedbacks?: Record<string, GrammarFeedback>
  onSelectFeedback?: (id: string) => void
  className?: string
}

export function AgentChatTranscript({
  agentState,
  messages = [],
  feedbacks = EMPTY_FEEDBACKS,
  onSelectFeedback,
  className,
  ...props
}: AgentChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {messages.length === 0
          ? (
              <div className="text-center text-muted-foreground py-8">
                No messages yet...
              </div>
            )
          : (
              messages.map((receivedMessage) => {
                const { id, timestamp, from, message } = receivedMessage
                const time = new Date(timestamp)
                const isUser = from?.isLocal ?? false
                const title = time.toLocaleTimeString(LOCALE, { timeStyle: 'full' })
                const hasFeedback = !!feedbacks[id]

                return (
                  <div
                    key={id}
                    title={title}
                    className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                  >
                    {isUser
                      ? (
                          <div className="flex items-end gap-2 max-w-[85%]">
                            {hasFeedback && (
                              <button
                                onClick={() => onSelectFeedback?.(id)}
                                className="shrink-0 p-1.5 rounded-full bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-all border border-amber-500/30 shadow-sm"
                                aria-label="View feedback"
                              >
                                <InfoIcon size={14} strokeWidth={3} />
                              </button>
                            )}
                            <div className="rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
                              {message}
                            </div>
                          </div>
                        )
                      : (
                          <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-card border text-foreground">
                            {message}
                          </div>
                        )}
                  </div>
                )
              })
            )}
        <AnimatePresence>
          {agentState === 'thinking' && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
