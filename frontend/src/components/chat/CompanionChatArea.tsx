import type { UIMessage } from '@ai-sdk/react'
import type { ChatStatus, FileUIPart } from 'ai'
import type { ReactNode } from 'react'
import type { SendMessage } from './ChatMessageItem'
import type { ContextChip } from './ContextChipBar'
import { ImageIcon, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { useI18n } from '@/contexts/I18nContext'
import {
  EXERCISE_TOOLS,
  getToolName,
  hasVisibleContent,
  isAwaitingTextAfterTools,
  isToolPart,
} from '@/lib/companion-utils'
import { MessageItem, StreamingDots } from './ChatMessageItem'
import { ContextChipBar } from './ContextChipBar'

/** Attach-image button — must be rendered inside a <PromptInput> so the context is available. */
function AttachImageButton({ label }: { label: string }) {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton
      aria-label={label}
      onClick={attachments.openFileDialog}
    >
      <ImageIcon className="size-5" />
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
  hasMore: boolean
  onLoadMore: () => void
  chips: ContextChip[]
  onRemoveChip: (id: string) => void
  onSend: (payload: SendPayload) => void
  headerSlot?: ReactNode
  placeholder?: string
}

export function CompanionChatArea({
  messages,
  isLoading,
  hasMore,
  onLoadMore,
  chips,
  onRemoveChip,
  onSend,
  headerSlot,
  placeholder,
}: CompanionChatAreaProps) {
  const { t } = useI18n()
  const chatStatus: ChatStatus = isLoading ? 'streaming' : 'ready'
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const scrollFromBottomRef = useRef<number | null>(null)
  const prevFirstIdRef = useRef<string | undefined>(undefined)
  const isAtBottomRef = useRef(true)
  // Gates IntersectionObserver until the initial scroll-to-bottom is verified.
  // useDeferredValue + StrictMode replays the deferred transition, transiently
  // resetting scrollTop to 0. Without this gate the observer sees the sentinel
  // in view during the reset and triggers a loadMore cascade.
  const scrollVerifiedRef = useRef(false)

  // Text-only resend path — used by MessageItem for quick-reply and resend actions.
  // Unlike handlePromptSubmit below, this path never carries file attachments because
  // resend/quick-reply actions always replay plain text messages.
  const sendMessage: SendMessage = (opts) => {
    isAtBottomRef.current = true
    onSend({ text: opts.text })
  }

  // Defer message list rendering so that typing (urgent) is never blocked by
  // streaming token updates (non-urgent). React will interrupt deferred renders
  // when the user types and resume them afterward.
  const deferredMessages = useDeferredValue(messages)

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

  // Track scroll position to know if user is near the bottom
  useEffect(() => {
    const container = scrollRef.current
    if (!container)
      return
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight
      isAtBottomRef.current = dist < 80
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // IntersectionObserver: load older messages when top sentinel is visible
  // Uses event-handler-refs pattern so observer is created once and never recreated
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const container = scrollRef.current
    if (!sentinel || !container)
      return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && scrollVerifiedRef.current) {
          scrollFromBottomRef.current = container.scrollHeight - container.scrollTop
          onLoadMoreRef.current()
        }
      },
      { root: container, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Restore scroll position after older messages are prepended (prevents viewport jump).
  // Must depend on deferredMessages (not live messages) because the DOM is rendered from
  // the deferred value — restoring before the deferred render would be a no-op.
  useLayoutEffect(() => {
    if (scrollFromBottomRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - scrollFromBottomRef.current
      scrollFromBottomRef.current = null
    }
  }, [deferredMessages])

  // Auto-scroll to bottom only when new messages arrive, not when older ones are prepended.
  // Uses useLayoutEffect (before paint) + direct scrollTop so the user never sees un-scrolled state.
  useLayoutEffect(() => {
    const firstId = uniqueMessages[0]?.id
    const wasPrepend = firstId !== prevFirstIdRef.current && prevFirstIdRef.current !== undefined
    prevFirstIdRef.current = firstId
    if (wasPrepend)
      return
    if (!isAtBottomRef.current)
      return
    const container = scrollRef.current
    if (!container)
      return
    container.scrollTop = container.scrollHeight
  }, [deferredMessages, isLoading, uniqueMessages])

  // Save/restore scroll position across tab visibility changes.
  // base-ui hides inactive panels with display:none, which:
  //   (a) resets scrollTop to 0 when the element re-appears
  //   (b) triggers the IntersectionObserver (sentinel suddenly in-view),
  //       causing a spurious loadMore on every tab-switch-back.
  // Saving before hide and restoring after show prevents both problems.
  useEffect(() => {
    const container = scrollRef.current
    if (!container)
      return
    let savedScrollTop: number | null = null
    let prevHeight = 0
    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height ?? 0
      if (prevHeight > 0 && newHeight === 0) {
        // Becoming hidden — save current scroll position
        savedScrollTop = container.scrollTop
      }
      else if (newHeight > 0 && savedScrollTop !== null) {
        // Returning from hidden — restore position before IntersectionObserver fires
        container.scrollTop = savedScrollTop
        savedScrollTop = null
      }
      prevHeight = newHeight
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Safety net: verify scroll position after StrictMode settles.
  // useDeferredValue + StrictMode replays the deferred transition, which can
  // transiently reset scrollTop to 0 AFTER the useLayoutEffect has scrolled.
  // useEffect fires after all StrictMode re-invocations; rAF fires before
  // the next paint, so the correction is invisible (at most one frame).
  //
  // Also handles the case where the initial page of messages fits the container
  // without overflow: scrollTop is capped at 0 (no scrollable area), so the
  // IntersectionObserver never fires a state-change and loadMore is never
  // triggered. We detect this and fire it manually so the viewport fills.
  useEffect(() => {
    if (scrollVerifiedRef.current || uniqueMessages.length === 0)
      return
    const container = scrollRef.current
    if (!container)
      return
    const raf = requestAnimationFrame(() => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight
      if (dist > 80) {
        container.scrollTop = container.scrollHeight
        isAtBottomRef.current = true
      }
      scrollVerifiedRef.current = true
      // Content fits without overflow — sentinel was visible at mount and
      // IntersectionObserver won't re-fire (no state change). Trigger manually.
      if (dist <= 0 && hasMoreRef.current) {
        scrollFromBottomRef.current = container.scrollHeight - container.scrollTop
        onLoadMoreRef.current()
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [uniqueMessages])

  // User-initiated send path — called by PromptInput's onSubmit. Carries the full
  // payload including any file attachments the user selected via the attach button.
  const handlePromptSubmit = useCallback((message: { text: string, files: FileUIPart[] }) => {
    const trimmed = message.text.trim()
    const hasFiles = message.files.length > 0
    if ((!trimmed && !hasFiles) || isLoading)
      return
    isAtBottomRef.current = true
    onSend({ text: trimmed, files: hasFiles ? message.files : undefined })
  }, [isLoading, onSend])

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center py-12">
            <p className="text-center text-sm text-muted-foreground">
              {t('lesson.companionPlaceholder')}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div ref={topSentinelRef} />
          {hasMore && (
            <div className="flex justify-center py-1">
              <span className="text-xs text-muted-foreground">{t('companion.scrollForOlder')}</span>
            </div>
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
      </div>

      <div ref={inputAreaRef} className="border-t border-border p-3">
        <PromptInput
          accept="image/jpeg,image/png,image/webp"
          maxFileSize={5 * 1024 * 1024}
          maxFiles={1}
          onError={handleAttachError}
          onSubmit={handlePromptSubmit}
        >
          <PromptInputHeader>
            {chips.length > 0 && <ContextChipBar chips={chips} onRemoveChip={onRemoveChip} />}
            <AttachmentPreviewBar />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea placeholder={placeholder ?? t('lesson.askAboutSegment')} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <AttachImageButton label={t('companion.attachImage')} />
            </PromptInputTools>
            <PromptInputSubmit status={chatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  )
}
