import type { UIMessage } from '@ai-sdk/react'
import type { ChatStatus, FileUIPart } from 'ai'
import type { ReactNode } from 'react'
import type { SendMessage } from './ChatMessageItem'
import type { ContextChip } from './ContextChipBar'
import { ArrowDownIcon, ImageIcon, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useStickToBottom } from 'use-stick-to-bottom'
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
import { Button } from '@/components/ui/button'
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
  onStop?: () => void
  headerSlot?: ReactNode
  placeholder?: string
}

export function CompanionChatArea({
  messages,
  isLoading,
  hasMore: _hasMore,
  onLoadMore: _onLoadMore,
  chips,
  onRemoveChip,
  onSend,
  onStop,
  headerSlot,
  placeholder,
}: CompanionChatAreaProps) {
  const { t } = useI18n()
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
    const trimmed = message.text.trim()
    const hasFiles = message.files.length > 0
    if ((!trimmed && !hasFiles) || isLoading)
      return
    scrollToBottom()
    onSend({ text: trimmed, files: hasFiles ? message.files : undefined })
  }, [isLoading, onSend, scrollToBottom])

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
        {messages.length === 0 && !isLoading && (
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
            <PromptInputSubmit status={chatStatus} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  )
}
