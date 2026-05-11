import type { UIMessage } from '@ai-sdk/react'
import type { ChatStatus, FileUIPart } from 'ai'
import type { ReactNode } from 'react'
import type { SendMessage } from './ChatMessageItem'
import type { ContextChip } from './ContextChipBar'
import { ArrowDownIcon, AudioLines, ImageIcon, Mic, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStickToBottom } from 'use-stick-to-bottom'
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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/contexts/I18nContext'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import {
  EXERCISE_TOOLS,
  getToolName,
  hasVisibleContent,
  isAwaitingTextAfterTools,
  isToolPart,
} from '@/lib/companion-utils'
import { MessageItem, StreamingDots } from './ChatMessageItem'
import { ContextChipBar } from './ContextChipBar'
import { VoiceInputBridge } from './VoiceInputBridge'

// Max recording burst in seconds — must match MAX_BURST_MS in useVoiceInput.
const BURST_DURATION_S = 30
const WAVE_BAR_COUNT = 4

/** Each bar gets a 5-step keyframe sequence; motion cycles through these as height values. */
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

/**
 * Circular recording button — destructive-colored countdown border + bouncing
 * waveform bars inside. Click to stop.
 */
function RecordingPill({ onStop }: { onStop: () => void }) {
  const [barHeights] = useState(generateBarHeights)
  return (
    <motion.button
      type="button"
      onClick={onStop}
      aria-label="Stop recording"
      initial={{ scale: 0.7, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-destructive/15 text-destructive focus-visible:outline-none"
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
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
            transition={{ duration: 1, repeat: Infinity, ease: 'linear', delay: i * 0.08 }}
            style={{ originY: 1 }}
            className="w-[2.5px] rounded-full bg-destructive"
          />
        ))}
      </div>
    </motion.button>
  )
}

/** Attach-image button — must be rendered inside a <PromptInput> so the context is available. */
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

/** Thumbnail strip for attached images — must be inside a <PromptInput>. */
function AttachmentPreviewBar() {
  const { files, remove } = usePromptInputAttachments()
  if (files.length === 0)
    return null
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-1">
      {files.map(f => (
        <div key={f.id} className="relative size-14 shrink-0">
          <img
            src={f.url}
            alt={f.filename ?? 'Attached image'}
            className="size-full rounded-md object-cover border border-border"
          />
          <button
            type="button"
            aria-label="Remove image"
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

export interface SendPayload {
  text: string
  files?: FileUIPart[]
}

interface CompanionChatAreaProps {
  messages: UIMessage[]
  isLoading: boolean
  isHistoryLoading?: boolean
  hasMore: boolean
  onLoadMore: () => void
  chips: ContextChip[]
  onRemoveChip: (id: string) => void
  onSend: (payload: SendPayload) => void
  onStop?: () => void
  headerSlot?: ReactNode
  placeholder?: string
  onSpeakClick?: () => void
}

export function CompanionChatArea({
  messages,
  isLoading,
  isHistoryLoading = false,
  hasMore: _hasMore,
  onLoadMore: _onLoadMore,
  chips,
  onRemoveChip,
  onSend,
  onStop,
  headerSlot,
  placeholder,
  onSpeakClick,
}: CompanionChatAreaProps) {
  const { t } = useI18n()
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
    if (voice.error) {
      toast.error(t(voice.error as Parameters<typeof t>[0]))
    }
  }, [voice.error, t])
  const chatStatus: ChatStatus = isLoading ? 'streaming' : 'ready'
  const inputAreaRef = useRef<HTMLDivElement>(null)
  // TODO: PAGINATION DISABLED — testing use-stick-to-bottom with full history

  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    initial: 'smooth',
    resize: 'smooth',
  })

  // Text-only resend path — used by MessageItem for quick-reply and resend actions.
  // Unlike handlePromptSubmit below, this path never carries file attachments because
  // resend/quick-reply actions always replay plain text messages.
  const sendMessage: SendMessage = (opts) => {
    scrollToBottom()
    onSend({ text: opts.text })
  }

  // Defer message list rendering so that typing (urgent) is never blocked by
  // streaming token updates (non-urgent). React will interrupt deferred renders
  // when the user types and resume them afterward.
  const deferredMessages = useDeferredValue(messages)

  // Track whether the initial deferred render has caught up at least once.
  // Used only to keep the loading spinner visible during the first paint of
  // restored history, where useDeferredValue lags behind setMessages by 1-2s
  // when the history is large. Once the first deferred render lands, we never
  // re-show the spinner — later deferred lag during streaming/typing is
  // expected and shouldn't flicker the loader. Resets when the hook starts a
  // new IDB fetch (isHistoryLoading flipping true) so lesson switches re-show
  // the loader.
  const initialRenderCompleteRef = useRef(false)
  const prevHistoryLoadingRef = useRef(isHistoryLoading)
  if (isHistoryLoading && !prevHistoryLoadingRef.current) {
    initialRenderCompleteRef.current = false
  }
  prevHistoryLoadingRef.current = isHistoryLoading
  if (!initialRenderCompleteRef.current && !isHistoryLoading && deferredMessages === messages) {
    initialRenderCompleteRef.current = true
  }
  const showInitialLoading = !initialRenderCompleteRef.current && (isHistoryLoading || messages.length > 0)

  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>()
    return deferredMessages.filter((m) => {
      if (!hasVisibleContent(m))
        return false
      if (seen.has(m.id))
        return false
      seen.add(m.id)
      return true
    })
  }, [deferredMessages])

  // For each "wide" tool type (exercises, charts, vocab cards), only the LAST
  // occurrence across all messages renders as a full widget. Earlier occurrences
  // collapse to a compact ToolCallCard to prevent history clutter.
  // Stabilize the Set reference so MessageItem memo isn't defeated during streaming.
  const prevWideIdsRef = useRef<ReadonlySet<string>>(new Set())
  const activeWideIds = useMemo(() => {
    const lastByToolName = new Map<string, string>() // toolName → toolCallId
    for (const msg of uniqueMessages) {
      for (const part of msg.parts) {
        if (!isToolPart(part) || part.state !== 'output-available')
          continue
        const toolName = getToolName(part)
        if (EXERCISE_TOOLS.has(toolName) || toolName === 'render_progress_chart' || toolName === 'render_vocab_card') {
          const id = part.toolCallId ?? part.type
          lastByToolName.set(toolName, id)
        }
      }
    }
    const next = new Set(lastByToolName.values())
    const prev = prevWideIdsRef.current
    if (prev.size === next.size && [...next].every(id => prev.has(id)))
      return prev
    prevWideIdsRef.current = next
    return next
  }, [uniqueMessages])

  // Auto-focus the textarea when a chip is added
  useEffect(() => {
    if (chips.length > 0) {
      const textarea = inputAreaRef.current?.querySelector('textarea')
      textarea?.focus()
    }
  }, [chips.length])

  const topSentinelRef = useRef<HTMLDivElement>(null)

  const hasMoreRef = useRef(_hasMore)
  hasMoreRef.current = _hasMore
  const onLoadMoreRef = useRef(_onLoadMore)
  onLoadMoreRef.current = _onLoadMore

  // 1. Trigger Load More via IntersectionObserver on the top sentinel
  useEffect(() => {
    const sentinel = topSentinelRef.current
    const scrollEl = scrollRef.current
    if (!sentinel || !scrollEl) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current) {
          onLoadMoreRef.current()
        }
      },
      { root: scrollEl, rootMargin: '200px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [scrollRef, _hasMore])

  // 2. Prevent scroll-jumping when older messages are prepended
  const prevScrollHeightRef = useRef<number>(0)
  const prevScrollTopRef = useRef<number>(0)
  const prevFirstMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) {
      return
    }
    const handleScroll = () => {
      prevScrollTopRef.current = scrollEl.scrollTop
    }
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [scrollRef])

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) {
      return
    }

    const currentFirstMessageId = uniqueMessages[0]?.id

    // If the first message ID changed and we had a previous one, it means we prepended items
    if (
      prevFirstMessageIdRef.current
      && currentFirstMessageId
      && prevFirstMessageIdRef.current !== currentFirstMessageId
      && prevScrollHeightRef.current > 0
    ) {
      const oldFirstMessageIndex = uniqueMessages.findIndex(m => m.id === prevFirstMessageIdRef.current)

      if (oldFirstMessageIndex > 0) { // Old oldest message is still here, but pushed down
        const heightDifference = scrollEl.scrollHeight - prevScrollHeightRef.current
        if (heightDifference > 0) {
          scrollEl.scrollTop = prevScrollTopRef.current + heightDifference
          prevScrollTopRef.current = scrollEl.scrollTop
        }
      }
    }

    prevFirstMessageIdRef.current = currentFirstMessageId
    prevScrollHeightRef.current = scrollEl.scrollHeight
  }, [uniqueMessages, scrollRef])

  // 3. Maintain scroll position when container is hidden (display: none)
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) {
      return
    }
    let savedScrollTop: number | null = null
    let prevHeight = 0
    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height ?? 0
      if (prevHeight > 0 && newHeight === 0) {
        savedScrollTop = scrollEl.scrollTop
      }
      else if (newHeight > 0 && savedScrollTop !== null) {
        scrollEl.scrollTop = savedScrollTop
        savedScrollTop = null
      }
      prevHeight = newHeight
    })
    observer.observe(scrollEl)
    return () => observer.disconnect()
  }, [scrollRef])

  // 4. Fallback for initial load if messages don't fill the screen
  const initialLoadCheckedRef = useRef(false)
  useEffect(() => {
    if (initialLoadCheckedRef.current || uniqueMessages.length === 0) {
      return
    }
    const scrollEl = scrollRef.current
    if (!scrollEl) {
      return
    }
    const raf = requestAnimationFrame(() => {
      if (scrollEl.scrollHeight <= scrollEl.clientHeight && hasMoreRef.current) {
        onLoadMoreRef.current()
      }
      initialLoadCheckedRef.current = true
    })
    return () => cancelAnimationFrame(raf)
  }, [uniqueMessages.length, scrollRef])

  // User-initiated send path — called by PromptInput's onSubmit. Carries the full
  // payload including any file attachments the user selected via the attach button.
  const handlePromptSubmit = useCallback((message: { text: string, files: FileUIPart[] }) => {
    // Block submit while voice session is active — user must explicitly stop the recording first.
    // Throw so PromptInput's outer try/catch swallows the call without clearing the textarea.
    if (voice.state !== 'idle')
      throw new Error('voice-active')
    const trimmed = message.text.trim()
    const hasFiles = message.files.length > 0
    if ((!trimmed && !hasFiles) || isLoading)
      return
    scrollToBottom()
    onSend({ text: trimmed, files: hasFiles ? message.files : undefined })
  }, [isLoading, onSend, scrollToBottom, voice.state])

  const handleAttachError = (err: { code: 'max_files' | 'max_file_size' | 'accept' }) => {
    if (err.code === 'accept') {
      toast.error(t('companion.imageUnsupportedType'))
    }
    else if (err.code === 'max_file_size') {
      toast.error(t('companion.imageTooLarge'))
    }
    else {
      toast.error(t('companion.imageTooMany'))
    }
  }

  return (
    <>
      {headerSlot}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
      >
        {showInitialLoading && (
          <div className="flex h-full items-center justify-center py-12">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        )}

        {!showInitialLoading && messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center py-12">
            <p className="text-center text-sm text-muted-foreground">
              {t('lesson.companionPlaceholder')}
            </p>
          </div>
        )}

        <div ref={contentRef} className="space-y-3">
          {_hasMore && (
            <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
          )}

          {uniqueMessages.map((msg: UIMessage) => (
            <div key={msg.id}>
              <MessageItem msg={msg} sendMessage={sendMessage} activeWideIds={activeWideIds} />
            </div>
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

        <div className="h-px" />

        {!isAtBottom && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => scrollToBottom()}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 rounded-full"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        )}
      </div>

      <div ref={inputAreaRef} className="relative border-t border-border p-3">
        <PromptInputProvider>
          <PromptInput
            accept="image/jpeg,image/png,image/webp"
            maxFileSize={5 * 1024 * 1024}
            maxFiles={1}
            onError={handleAttachError}
            onSubmit={handlePromptSubmit}
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
              {chips.length > 0 && <ContextChipBar chips={chips} onRemoveChip={onRemoveChip} />}
              <AttachmentPreviewBar />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea placeholder={placeholder ?? t('lesson.askAboutSegment')} />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools className="gap-2">
                {onSpeakClick && (
                  <PromptInputButton
                    variant="default"
                    size="icon-sm"
                    onClick={voice.state !== 'idle' ? undefined : onSpeakClick}
                    title={t('speak.title')}
                    aria-label={t('speak.title')}
                    className={`bg-linear-to-br from-[#7e14ff] via-[#5b6cff] to-[#47bfff] text-white shadow-sm shadow-[#5b6cff]/40 hover:from-[#9341ff] hover:via-[#7787ff] hover:to-[#5fc8ff] hover:text-white${voice.state !== 'idle' ? ' pointer-events-none opacity-50' : ''}`}
                  >
                    <AudioLines className="size-4" />
                  </PromptInputButton>
                )}
                <AttachImageButton tooltip={t('companion.attachImage')} muted={voice.state !== 'idle'} />
                {voice.state === 'recording'
                  ? <RecordingPill onStop={() => voice.stop()} />
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
                status={chatStatus}
                onStop={onStop}
                className={voice.state !== 'idle' ? 'pointer-events-none opacity-50' : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </>
  )
}
