import type { UIMessage } from '@ai-sdk/react'
import type { ChatStatus } from 'ai'
import type { ReactNode } from 'react'
import type { SendMessage } from './ChatMessageItem'
import type { ContextChip } from './ContextChipBar'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
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

interface CompanionChatAreaProps {
  messages: UIMessage[]
  isLoading: boolean
  hasMore: boolean
  onLoadMore: () => void
  chips: ContextChip[]
  onRemoveChip: (id: string) => void
  onSend: (text: string) => void
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const scrollFromBottomRef = useRef<number | null>(null)
  const prevFirstIdRef = useRef<string | undefined>(undefined)
  const isAtBottomRef = useRef(true)

  const sendMessage: SendMessage = (opts) => {
    isAtBottomRef.current = true
    onSend(opts.text)
  }

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
        if (entry.isIntersecting && hasMoreRef.current) {
          scrollFromBottomRef.current = container.scrollHeight - container.scrollTop
          onLoadMoreRef.current()
        }
      },
      { root: container, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Restore scroll position after older messages are prepended (prevents viewport jump)
  useLayoutEffect(() => {
    if (scrollFromBottomRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - scrollFromBottomRef.current
      scrollFromBottomRef.current = null
    }
  }, [messages])

  // Auto-scroll to bottom only when new messages arrive, not when older ones are prepended
  useEffect(() => {
    const firstId = uniqueMessages[0]?.id
    const wasPrepend = firstId !== prevFirstIdRef.current && prevFirstIdRef.current !== undefined
    prevFirstIdRef.current = firstId
    if (wasPrepend)
      return
    if (!isAtBottomRef.current)
      return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, uniqueMessages])

  const handlePromptSubmit = (message: { text: string }) => {
    const trimmed = message.text.trim()
    if (!trimmed || isLoading)
      return
    isAtBottomRef.current = true
    sendMessage({ text: trimmed })
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
              <span className="text-xs text-muted-foreground">↑ Scroll for older messages</span>
            </div>
          )}
          {uniqueMessages.map((msg: UIMessage) => (
            <div key={msg.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}>
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

        <div ref={bottomRef} className="h-px" />
      </div>

      <div className="border-t border-border p-3">
        <PromptInput onSubmit={handlePromptSubmit}>
          {chips.length > 0
            ? (
                <PromptInputHeader>
                  <ContextChipBar chips={chips} onRemoveChip={onRemoveChip} />
                </PromptInputHeader>
              )
            : null}
          <PromptInputBody>
            <PromptInputTextarea placeholder={placeholder ?? t('lesson.askAboutSegment')} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={chatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  )
}
