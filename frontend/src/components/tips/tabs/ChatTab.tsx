import type { UIMessage } from '@ai-sdk/react'
import type { FileUIPart } from 'ai'
import type { TipChatKind } from '@/types/tips'
import { ImageIcon, MessageSquareDashed, Mic, X } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/contexts/I18nContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { useTipChat } from '@/hooks/useTipChat'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { VoiceInputBridge } from '../../chat/VoiceInputBridge'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
  kind?: TipChatKind
  systemPrompt?: string
  initialUserMessage?: string
}

const BURST_DURATION_S = 30
const WAVE_BAR_COUNT = 4

function generateBarHeights(): number[][] {
  // eslint-disable-next-line e18e/prefer-array-fill -- callback uses Math.random() per call
  return Array.from({ length: WAVE_BAR_COUNT }, () => [
    4 + Math.random() * 3,
    10 + Math.random() * 4,
    6 + Math.random() * 3,
    14 + Math.random() * 4,
    5 + Math.random() * 3,
  ])
}

function RecordingPill({ onStop, label }: { onStop: () => void, label: string }) {
  const [barHeights] = useState(generateBarHeights)
  return (
    <motion.button
      type="button"
      onClick={onStop}
      aria-label={label}
      initial={{ scale: 0.7, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-destructive/15 text-destructive focus-visible:outline-none"
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <motion.circle
          cx="50%"
          cy="50%"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          pathLength={1}
          strokeDasharray="1"
          strokeLinecap="round"
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: BURST_DURATION_S, ease: 'linear' }}
        />
      </svg>
      <div className="relative z-10 flex items-center gap-[2px]">
        {barHeights.map((heights, i) => (
          <motion.div

            key={i}
            animate={{ height: heights }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear', delay: i * 0.08 }}
            style={{ originY: 1 }}
            className="w-[2.5px] rounded-full bg-destructive"
          />
        ))}
      </div>
    </motion.button>
  )
}

function AttachImageButton({ tooltip, muted }: { tooltip: string, muted?: boolean }) {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton
      size="icon-sm"
      title={tooltip}
      aria-label={tooltip}
      onClick={muted ? undefined : attachments.openFileDialog}
      className={muted ? 'pointer-events-none opacity-50' : undefined}
    >
      <ImageIcon className="size-4" />
    </PromptInputButton>
  )
}

function AttachmentPreviewBar({ altFallback, removeLabel }: { altFallback: string, removeLabel: string }) {
  const { files, remove } = usePromptInputAttachments()
  if (files.length === 0)
    return null
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-1">
      {files.map(f => (
        <div key={f.id} className="relative size-14 shrink-0">
          <img
            src={f.url}
            alt={f.filename ?? altFallback}
            className="size-full rounded-md object-cover border border-border"
          />
          <button
            type="button"
            aria-label={removeLabel}
            onClick={() => remove(f.id)}
            className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Match [HH:MM:SS] or [MM:SS] timestamp tokens inline (not already a markdown
// link, not inside a code span). Captured group is the raw token "MM:SS"
// or "HH:MM:SS". Re-emitted as markdown link with timestamp: scheme so
// ReactMarkdown's <a> handler can intercept the click.
const TIMESTAMP_TOKEN_RE = /\[(\d{1,2}(?::\d{2}){1,2})\](?!\()/g

function tokenToSeconds(token: string): number {
  const parts = token.split(':').map(p => Number.parseInt(p, 10))
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

function linkifyTimestamps(text: string): string {
  return text.replace(TIMESTAMP_TOKEN_RE, (_, token) => `[${token}](timestamp:${tokenToSeconds(token)})`)
}

const MemoMarkdown = memo(({ text, onSeek }: { text: string, onSeek: (sec: number) => void }) => (
  <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          // ReactMarkdown URL-encodes the colon in custom schemes, so
          // `timestamp:83` arrives as `timestamp%3A83`. Decode before testing.
          const decoded = typeof href === 'string' ? decodeURIComponent(href) : ''
          if (decoded.startsWith('timestamp:')) {
            const sec = Number.parseInt(decoded.slice('timestamp:'.length), 10)
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSeek(sec)
                }}
                className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[0.7rem] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer not-prose tabular-nums"
              >
                {children}
              </button>
            )
          }
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>
        },
      }}
    >
      {linkifyTimestamps(text)}
    </ReactMarkdown>
  </div>
))

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  )
}

function ChatBubble({ message, imageAlt, onSeek }: { message: UIMessage, imageAlt: string, onSeek: (sec: number) => void }) {
  const text = messageText(message)
  if (message.role === 'user') {
    return (
      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0, x: 16, y: 4 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
          <p className="whitespace-pre-wrap">{text}</p>
          {message.parts.filter(p => p.type === 'file').map((p: any, i) => (
            p.url && typeof p.mediaType === 'string' && p.mediaType.startsWith('image/')
              ? (
                  <img

                    key={i}
                    src={p.url}
                    alt={p.filename ?? imageAlt}
                    className="max-h-48 max-w-full rounded-md object-contain mt-2"
                  />
                )
              : null
          ))}
        </div>
      </motion.div>
    )
  }
  return (
    <motion.div
      className="flex justify-start w-full"
      initial={{ opacity: 0, x: -16, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-card border text-foreground">
        <MemoMarkdown text={text} onSeek={onSeek} />
      </div>
    </motion.div>
  )
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map((p: any) => p.text as string)
    .join('')
}

export function ChatTab({ courseId, videoId, lessonTitle, transcript, transcriptStatus, kind, systemPrompt, initialUserMessage }: Props) {
  const { locale, t } = useI18n()
  const { player } = usePlayer()
  const onSeek = useCallback((sec: number) => {
    player?.seekTo(sec)
    player?.play()
  }, [player])
  const chat = useTipChat({
    courseId,
    videoId,
    lessonTitle,
    transcript,
    uiLanguage: locale === 'vi' ? 'vi' : 'en',
    kind,
    systemPrompt,
  })

  const [draftText, setDraftText] = useState('')
  const [pendingConfirmed, setPendingConfirmed] = useState<string | null>(null)
  const [restoreBase, setRestoreBase] = useState(false)
  const handleRestoreHandled = useCallback(() => setRestoreBase(false), [])

  const voice = useVoiceInput({
    onDraft: setDraftText,
    onConfirmed: (text) => {
      setDraftText('')
      setPendingConfirmed(text)
    },
    onCancel: () => {
      setDraftText('')
      setRestoreBase(true)
    },
  })

  useEffect(() => {
    if (voice.error)
      toast.error(t(voice.error as Parameters<typeof t>[0]))
  }, [voice.error, t])

  const lastSeededRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialUserMessage)
      return
    if (lastSeededRef.current === initialUserMessage)
      return
    if (!chat.ready || chat.disabled)
      return
    lastSeededRef.current = initialUserMessage
    chat.sendMessage({ text: initialUserMessage })
  }, [initialUserMessage, chat.ready, chat.disabled, chat.sendMessage])

  const handleSubmit = useCallback((message: { text: string, files: FileUIPart[] }) => {
    if (voice.state !== 'idle')
      throw new Error('voice-active')
    const trimmed = message.text.trim()
    const hasFiles = message.files.length > 0
    if ((!trimmed && !hasFiles) || chat.disabled)
      return
    chat.sendMessage({ text: trimmed, ...(hasFiles ? { files: message.files } : {}) } as Parameters<typeof chat.sendMessage>[0])
  }, [voice.state, chat])

  const handleAttachError = (err: { code: 'max_files' | 'max_file_size' | 'accept', message: string }) => {
    toast.error(err.message)
  }

  if (transcriptStatus === 'pending')
    return null

  if (transcriptStatus === 'unavailable') {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p className="font-bold text-foreground mb-1">{t('tips.chat.unavailable.title')}</p>
        <p>{t('tips.chat.unavailable.body')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1">
        <ConversationContent className="gap-3">
          {chat.messages.length === 0 && chat.status === 'ready' && (
            <ConversationEmptyState
              icon={<MessageSquareDashed className="size-8" />}
              title={t('tips.chat.empty.title')}
              description={t('tips.chat.empty.body')}
            />
          )}
          {chat.messages.map(m => <ChatBubble key={m.id} message={m} imageAlt={t('tips.chat.imageAlt')} onSeek={onSeek} />)}
          {(chat.status === 'submitted' || chat.status === 'streaming')
            && (chat.messages.length === 0
              || chat.messages.at(-1)?.role === 'user'
              || !messageText(chat.messages.at(-1)!).trim())
            && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <StreamingDots />
                </div>
              </div>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border p-3">
        <PromptInputProvider>
          <PromptInput
            accept="image/jpeg,image/png,image/webp"
            maxFileSize={5 * 1024 * 1024}
            maxFiles={1}
            onError={handleAttachError}
            onSubmit={handleSubmit}
          >
            <VoiceInputBridge
              voiceState={voice.state}
              draftText={draftText}
              pendingConfirmed={pendingConfirmed}
              onConfirmedFlushed={() => setPendingConfirmed(null)}
              restoreBase={restoreBase}
              onRestoreHandled={handleRestoreHandled}
            />
            <PromptInputHeader>
              <AttachmentPreviewBar altFallback={t('tips.chat.imageAlt')} removeLabel={t('tips.chat.removeImage')} />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder={chat.disabledReason === 'no-transcript' ? t('tips.chat.disabled.transcript') : t('tips.chat.placeholder')}
                disabled={chat.disabled}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools className="gap-2">
                <AttachImageButton tooltip={t('companion.attachImage')} muted={voice.state !== 'idle'} />
                {voice.state === 'recording'
                  ? <RecordingPill onStop={() => voice.stop()} label={t('tips.chat.stopRecording')} />
                  : (
                      <PromptInputButton
                        size="icon-sm"
                        title={t('voice.dictate')}
                        aria-label={t('voice.dictate')}
                        onClick={() => voice.state === 'idle' && voice.start()}
                        disabled={voice.state === 'connecting' || voice.state === 'processing'}
                      >
                        {voice.state === 'connecting' || voice.state === 'processing'
                          ? <Spinner className="size-4" />
                          : <Mic className="size-4" />}
                      </PromptInputButton>
                    )}
              </PromptInputTools>
              <PromptInputSubmit
                status={chat.status}
                disabled={chat.disabled}
                className={voice.state !== 'idle' ? 'pointer-events-none opacity-50' : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  )
}
