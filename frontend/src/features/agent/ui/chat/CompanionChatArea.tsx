import type { UIMessage } from '@ai-sdk/react'
import type { ChatStatus, FileUIPart } from 'ai'
import type { ReactNode } from 'react'
import type { SendMessage } from './ChatMessageItem'
import type { MessageAction } from './MessageActions'
import type { ContextChip } from '@/features/agent/domain/contextChip'
import { ArrowDownIcon, Mic } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStickToBottom } from 'use-stick-to-bottom'
import { useI18n } from '@/contexts/I18nContext'
import { useVoiceInput } from '@/features/agent/application/useVoiceInput'
import {
  EXERCISE_TOOLS,
  getToolName,
  hasVisibleContent,
  isAwaitingTextAfterTools,
  isToolPart,
} from '@/features/agent/lib/companion-utils'
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
} from '@/shared/ui/ai-elements/prompt-input'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/spinner'
import { MessageItem, StreamingDots } from './ChatMessageItem'
import { ContextChipBar } from './ContextChipBar'
import { ChatEmptyState } from './EmptyState'
import { AttachImageButton, AttachmentPreviewBar, RecordingPill } from './PromptInputExtras'
import { VoiceInputBridge } from './VoiceInputBridge'

export interface SendPayload {
  text: string
  files?: FileUIPart[]
}

const DEFAULT_MESSAGE_ACTIONS: MessageAction[] = [{ kind: 'copy' }, { kind: 'regenerate' }]

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

  /** Extra toolbar buttons rendered at the outer left (before Attach). Stable identity recommended. */
  toolbarLeading?: ReactNode
  /** Extra toolbar buttons rendered at the outer right (after Mic). Stable identity recommended. */
  toolbarTrailing?: ReactNode
  /** Override default empty-state copy + icon. */
  emptyState?: { icon?: ReactNode, title: string, description: string }
  /** Disable textarea + submit + Mic start. */
  disabled?: boolean
  disabledPlaceholder?: string
  /** When set, [MM:SS] tokens in assistant text linkify and click invokes this. Memoize at caller. */
  onTimestampClick?: (sec: number) => void
  /** Per-message action toolbar config. Default: Copy + Regenerate. Memoize array at caller. */
  messageActions?: MessageAction[]
  /** Called when the 'regenerate' action triggers. Memoize at caller. */
  onRegenerate?: () => void
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
  toolbarLeading,
  toolbarTrailing,
  emptyState,
  disabled = false,
  disabledPlaceholder,
  onTimestampClick,
  messageActions,
  onRegenerate,
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

  const showInitialLoading = isHistoryLoading && messages.length === 0

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
    if ((!trimmed && !hasFiles) || isLoading || disabled)
      return
    scrollToBottom()
    onSend({ text: trimmed, files: hasFiles ? message.files : undefined })
  }, [isLoading, disabled, onSend, scrollToBottom, voice.state])

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

  const resolvedActions = messageActions ?? DEFAULT_MESSAGE_ACTIONS
  const resolvedPlaceholder = disabled
    ? (disabledPlaceholder ?? placeholder ?? t('lesson.askAboutSegment'))
    : (placeholder ?? t('lesson.askAboutSegment'))

  return (
    <>
      {headerSlot}

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-6"
      >
        {showInitialLoading && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        )}

        {!showInitialLoading && messages.length === 0 && !isLoading && (
          emptyState
            ? <ChatEmptyState icon={emptyState.icon} title={emptyState.title} description={emptyState.description} />
            : <ChatEmptyState title={t('lesson.companion')} description={t('lesson.companionPlaceholder')} />
        )}

        <div ref={contentRef} className="space-y-3">
          {_hasMore && (
            <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
          )}

          {uniqueMessages.map((msg: UIMessage, idx) => {
            const isLast = idx === uniqueMessages.length - 1
            const isStreaming = isLast && msg.role === 'assistant' && isLoading
            return (
              <div key={msg.id}>
                <MessageItem
                  msg={msg}
                  sendMessage={sendMessage}
                  activeWideIds={activeWideIds}
                  isLast={isLast}
                  isStreaming={isStreaming}
                  onTimestampClick={onTimestampClick}
                  actions={resolvedActions}
                  onRegenerate={onRegenerate}
                />
              </div>
            )
          })}

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

        {messages.length > 0 && <div className="h-px" />}

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
              <AttachmentPreviewBar altFallback="Attached image" removeLabel="Remove image" />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea placeholder={resolvedPlaceholder} disabled={disabled} />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools className="gap-2">
                {toolbarLeading}
                <AttachImageButton tooltip={t('companion.attachImage')} muted={voice.state !== 'idle' || disabled} />
                {voice.state === 'recording'
                  ? <RecordingPill onStop={() => voice.stop()} label="Stop recording" />
                  : (
                      <PromptInputButton
                        size="icon-sm"
                        title={t('voice.dictate')}
                        aria-label={t('voice.dictate')}
                        onClick={() => voice.state === 'idle' && voice.start()}
                        disabled={disabled || voice.state === 'connecting' || voice.state === 'processing'}
                      >
                        {voice.state === 'connecting' || voice.state === 'processing'
                          ? <Spinner className="size-4" />
                          : <Mic className="size-4" />}
                      </PromptInputButton>
                    )}
                {toolbarTrailing}
              </PromptInputTools>
              <PromptInputSubmit
                status={chatStatus}
                disabled={disabled}
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
