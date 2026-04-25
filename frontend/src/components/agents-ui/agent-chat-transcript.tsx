import type { AgentState, ReceivedMessage } from '@livekit/components-react'
import type { ComponentProps } from 'react'
import type { AiTurnTranslation, GrammarFeedback } from '@/types'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { cn } from '@/lib/utils'

const LOCALE = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
const EMPTY_FEEDBACKS: Record<string, GrammarFeedback> = {}

export function GrammarCorrectionCard({ feedback }: { feedback: GrammarFeedback }) {
  if (!feedback.issues.length)
    return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="mt-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2"
    >
      {feedback.issues.map(issue => (
        <div key={`${issue.original}::${issue.correction}::${issue.explanation}`} className="flex flex-col gap-1 rounded-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground line-through decoration-amber-500/60">{issue.original}</span>
            <span className="text-amber-500 font-bold text-xs">→</span>
            <span className="text-sm text-foreground font-bold">{issue.correction}</span>
          </div>
          {issue.explanation && (
            <p className="text-sm text-amber-200/80 leading-relaxed">
              {issue.explanation}
            </p>
          )}
        </div>
      ))}
    </motion.div>
  )
}

export function TranslationInline({ translation, romanization }: { translation?: string, romanization?: string }) {
  if (!translation && !romanization)
    return null
  return (
    <div className="space-y-3">
      <div className="h-px w-full bg-border" />
      {romanization && (
        <p className="text-xs font-mono text-foreground/75 tracking-tight leading-snug">{romanization}</p>
      )}
      {translation && (
        <p className="text-sm text-foreground/85 italic leading-snug">{translation}</p>
      )}
    </div>
  )
}

const EMPTY_TRANSLATIONS: Record<string, AiTurnTranslation> = {}

export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  agentState?: AgentState
  messages?: ReceivedMessage[]
  feedbacks?: Record<string, GrammarFeedback>
  aiTurnTranslations?: Record<string, AiTurnTranslation>
  className?: string
}

export function AgentChatTranscript({
  agentState,
  messages = [],
  feedbacks = EMPTY_FEEDBACKS,
  aiTurnTranslations = EMPTY_TRANSLATIONS,
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
                const feedback = feedbacks[id]

                const translation = aiTurnTranslations[id]

                return (
                  <div
                    key={id}
                    title={title}
                    className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                  >
                    {isUser
                      ? (
                          <div className="flex flex-col items-end max-w-[85%]">
                            <div className="flex items-center gap-1.5">
                              {feedback && (
                                feedback.issues.length > 0
                                  ? <AlertCircle className="size-5 text-amber-500 shrink-0" />
                                  : <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                              )}
                              <div className="rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
                                <p className="wrap-break-word">{message}</p>
                              </div>
                            </div>
                            {feedback && <GrammarCorrectionCard feedback={feedback} />}
                          </div>
                        )
                      : (
                          <div className="max-w-[85%]">
                            <div className="rounded-lg px-3 py-2 text-sm bg-card border text-foreground space-y-2">
                              <p className="wrap-break-word">{message}</p>
                              {translation && (
                                <TranslationInline
                                  translation={translation.translation}
                                  romanization={translation.romanization}
                                />
                              )}
                            </div>
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
