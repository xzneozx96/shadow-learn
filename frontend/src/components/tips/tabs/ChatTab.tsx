import type { FileUIPart } from 'ai'
import type { ContextChip } from '@/components/chat/ContextChipBar'
import type { MessageAction } from '@/components/chat/MessageActions'
import type { TranslationKey } from '@/lib/i18n'
import { Bot, GraduationCap, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { CompanionChatArea } from '@/components/chat/CompanionChatArea'
import { useI18n } from '@/contexts/I18nContext'
import { useZoberChat } from '@/hooks/useZoberChat'
import { escapeHtml } from '@/lib/htmlText'
import { saveTipNote } from '@/lib/tipNoteBus'
import { seekTip } from '@/lib/tipSeekBus'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
  initialUserMessage?: string
  chips?: ContextChip[]
  onRemoveChip?: (id: string) => void
  onClearChips?: () => void
}

const NEWLINES_RE = /\n+/g
const SINGLE_NEWLINE_RE = /\n/g
const BLANK_LINE_RE = /\n{2,}/g

function GuidedModeToggle({
  guided,
  setGuided,
  t,
}: {
  guided: boolean
  setGuided: (v: boolean) => void
  t: (key: TranslationKey) => string
}) {
  if (guided) {
    return (
      <PromptInputButton
        title={t('tips.chat.guidedLearning.tooltip')}
        aria-label={t('tips.chat.guidedLearning.offToast')}
        onClick={() => {
          setGuided(false)
          toast.success(t('tips.chat.guidedLearning.offToast'))
        }}
        data-state="on"
        className="bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary rounded-full px-2.5"
      >
        <GraduationCap className="size-4" />
        <span className="text-xs font-medium">{t('tips.chat.guidedLearning.tooltip')}</span>
        <X className="size-3.5 opacity-70" />
      </PromptInputButton>
    )
  }
  return (
    <PromptInputButton
      size="icon-sm"
      title={t('tips.chat.guidedLearning.tooltip')}
      aria-label={t('tips.chat.guidedLearning.tooltip')}
      onClick={() => {
        setGuided(true)
        toast.success(t('tips.chat.guidedLearning.onToast'))
      }}
      data-state="off"
    >
      <GraduationCap className="size-4" />
    </PromptInputButton>
  )
}

function UnavailableNotice({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      <p className="font-bold text-foreground mb-1">{t('tips.chat.unavailable.title')}</p>
      <p>{t('tips.chat.unavailable.body')}</p>
    </div>
  )
}

export function ChatTab(props: Props) {
  const { courseId, videoId, lessonTitle, transcript, transcriptStatus, initialUserMessage, chips = [], onRemoveChip, onClearChips } = props
  const { locale, t } = useI18n()
  const [guided, setGuided] = useState(false)
  const zober = useZoberChat({
    surface: 'tip',
    courseId,
    videoId,
    lessonTitle,
    transcript,
    uiLanguage: locale === 'vi' ? 'vi' : 'en',
    mode: guided ? 'guided' : 'free',
  })

  const handleSaveTipNote = useCallback(
    async (text: string, messageId: string) => {
      const firstLine = text.split(SINGLE_NEWLINE_RE)[0]?.slice(0, 80) ?? ''
      const html = text
        .split(BLANK_LINE_RE)
        .map(block => `<p>${escapeHtml(block).replace(SINGLE_NEWLINE_RE, '<br>')}</p>`)
        .join('')
      await saveTipNote({
        videoId,
        title: firstLine,
        html,
        source: 'chat',
        sourceRef: { kind: 'chat', ref: messageId },
      })
    },
    [videoId],
  )

  const messageActions = useMemo<MessageAction[]>(
    () => [
      { kind: 'copy' },
      { kind: 'regenerate' },
      { kind: 'save', onSave: handleSaveTipNote },
    ],
    [handleSaveTipNote],
  )

  const toolbarTrailing = useMemo(
    () => <GuidedModeToggle guided={guided} setGuided={setGuided} t={t} />,
    [guided, t],
  )

  const emptyState = useMemo(
    () => ({
      icon: <Bot className="size-8" />,
      title: t('tips.chat.empty.title'),
      description: t('tips.chat.empty.body'),
    }),
    [t],
  )

  const handleSend = useCallback(
    ({ text, files }: { text: string, files?: FileUIPart[] }) => {
      const trimmed = text.trim()
      const hasFiles = !!files && files.length > 0
      if ((!trimmed && !hasFiles) || zober.disabled)
        return
      const composed = chips.length > 0
        ? `Context:\n${chips.map(c => `> ${c.text.replace(NEWLINES_RE, ' ')}`).join('\n')}\n\n${trimmed}`
        : trimmed
      zober.sendMessage({ text: composed, ...(hasFiles ? { files } : {}) } as Parameters<typeof zober.sendMessage>[0])
      if (chips.length > 0)
        onClearChips?.()
    },
    [zober, chips, onClearChips],
  )

  const lastSeededRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialUserMessage)
      return
    if (lastSeededRef.current === initialUserMessage)
      return
    if (zober.isHistoryLoading || zober.disabled)
      return
    lastSeededRef.current = initialUserMessage
    zober.sendMessage({ text: initialUserMessage })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserMessage, zober.isHistoryLoading, zober.disabled, zober.sendMessage])

  const handleRemoveChip = useCallback((id: string) => onRemoveChip?.(id), [onRemoveChip])

  if (transcriptStatus === 'pending')
    return null
  if (transcriptStatus === 'unavailable')
    return <UnavailableNotice t={t} />

  return (
    <div className="flex flex-col h-full">
      <CompanionChatArea
        messages={zober.messages}
        isLoading={zober.status === 'streaming' || zober.status === 'submitted'}
        isHistoryLoading={zober.isHistoryLoading}
        hasMore={false}
        onLoadMore={NOOP}
        chips={chips}
        onRemoveChip={handleRemoveChip}
        onSend={handleSend}
        onStop={zober.stop}
        onRegenerate={zober.regenerate}
        placeholder={t('tips.chat.placeholder')}
        disabled={zober.disabled}
        disabledPlaceholder={t('tips.chat.disabled.transcript')}
        emptyState={emptyState}
        toolbarTrailing={toolbarTrailing}
        onTimestampClick={seekTip}
        messageActions={messageActions}
      />
    </div>
  )
}

function NOOP() {}
