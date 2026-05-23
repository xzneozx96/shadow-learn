import type { Segment } from '@/shared/types'
import { BookOpenText, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { useAgentActions } from '@/features/agent/application/AgentActionsContext'
import { useGlobalCompanionContext } from '@/features/agent/application/GlobalCompanionContext'
import { useZoberChat } from '@/features/agent/application/useZoberChat'
import { CompanionChatArea } from '@/features/agent/ui/chat/CompanionChatArea'
import { GuidedModeToggle } from '@/features/agent/ui/chat/GuidedModeToggle'
import { SpeakWithAIButton } from '@/features/agent/ui/chat/PromptInputExtras'
import { LessonWorkbookPanel } from '@/features/lesson/ui/LessonWorkbookPanel'
import { useSpeakModal } from '@/features/speak/application/SpeakModalContext'
import { useVocabulary } from '@/features/vocabulary/application/VocabularyContext'
import { captureCompanionMessageSent } from '@/shared/lib/posthog-events'
import { Badge } from '@/shared/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

const NEWLINES_RE = /\n+/g

interface CompanionPanelProps {
  activeSegment: Segment | null
  lessonId: string
  lessonTitle?: string
  activeTab?: string
  onTabChange?: (tab: string) => void
  roleplaySystemPrompt?: string
}

export function CompanionPanel({
  activeSegment,
  lessonId,
  lessonTitle,
  activeTab,
  onTabChange,
  roleplaySystemPrompt,
}: CompanionPanelProps) {
  const { t } = useI18n()
  const { entriesByLesson } = useVocabulary()
  const count = (entriesByLesson[lessonId] ?? []).length
  const { chips, removeChip, clearChips } = useGlobalCompanionContext()
  const { dispatchAction } = useAgentActions()
  const [guided, setGuided] = useState(false)
  const { messages, isLoading, isHistoryLoading, sendMessage: sendMessageRaw, stop, regenerate, loadMore, hasMore } = useZoberChat({
    surface: 'lesson',
    lessonId,
    lessonTitle,
    activeSegment,
    roleplaySystemPrompt,
    dispatchAction,
    mode: guided ? 'guided' : 'free',
  })
  const { openSpeakModal } = useSpeakModal()
  const speakExtras = useMemo(
    () => <SpeakWithAIButton onClick={openSpeakModal} title={t('speak.title')} />,
    [openSpeakModal, t],
  )
  const guidedToggle = useMemo(
    () => (
      <GuidedModeToggle
        guided={guided}
        setGuided={setGuided}
        tooltip={t('tips.chat.guidedLearning.tooltip')}
        onToast={t('tips.chat.guidedLearning.onToast')}
        offToast={t('tips.chat.guidedLearning.offToast')}
      />
    ),
    [guided, t],
  )

  useEffect(() => {
    if (chips.length > 0)
      onTabChange?.('ai')
  }, [chips.length, onTabChange])

  function handleSend({ text, files }: { text: string, files?: import('ai').FileUIPart[] }) {
    const context = chips.map(c => `> ${c.text.replace(NEWLINES_RE, ' ')}`).join('\n')
    const composed = chips.length > 0 ? `Context:\n${context}\n\n${text}` : text
    captureCompanionMessageSent({ with_context: chips.length > 0, file_count: files?.length ?? 0 })
    sendMessageRaw({ text: composed, files })
    clearChips()
  }

  const headerSlot = activeSegment
    ? (
        <div className="h-10 flex items-center border-b border-border px-3 py-2">
          <Badge variant="secondary" className="max-w-full truncate text-sm">
            {activeSegment.text}
          </Badge>
        </div>
      )
    : undefined

  return (
    <Tabs defaultValue="ai" value={activeTab} onValueChange={onTabChange} className="flex h-full flex-col gap-0">
      <TabsList variant="line" className="w-full shrink-0 border-b border-border rounded-none h-13!">
        <TabsTrigger value="ai">
          <MessageSquare className="size-4" aria-hidden />
          {t('lesson.aiCompanion')}
        </TabsTrigger>
        <TabsTrigger value="workbook" className="gap-1.5">
          <BookOpenText className="size-4" aria-hidden />
          {t('lesson.workbook')}
          {count > 0 && <Badge className="size-5 text-xs">{count}</Badge>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CompanionChatArea
          messages={messages}
          isLoading={isLoading}
          isHistoryLoading={isHistoryLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          chips={chips}
          onRemoveChip={removeChip}
          onSend={handleSend}
          onStop={stop}
          headerSlot={headerSlot}
          toolbarLeading={speakExtras}
          toolbarTrailing={guidedToggle}
          onRegenerate={regenerate}
        />
      </TabsContent>

      <TabsContent value="workbook" className="min-h-0 flex-1 overflow-hidden">
        <LessonWorkbookPanel lessonId={lessonId} />
      </TabsContent>
    </Tabs>
  )
}
