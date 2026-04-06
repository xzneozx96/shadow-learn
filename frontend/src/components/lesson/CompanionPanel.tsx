import type { Segment } from '@/types'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useAgentChat } from '@/hooks/useAgentChat'
import { captureCompanionMessageSent } from '@/lib/posthog-events'
import { CompanionChatArea } from '../chat/CompanionChatArea'
import { LessonWorkbookPanel } from './LessonWorkbookPanel'

interface CompanionPanelProps {
  activeSegment: Segment | null
  lessonId: string
  lessonTitle?: string
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export function CompanionPanel({
  activeSegment,
  lessonId,
  lessonTitle,
  activeTab,
  onTabChange,
}: CompanionPanelProps) {
  const { t } = useI18n()
  const { entriesByLesson } = useVocabulary()
  const count = (entriesByLesson[lessonId] ?? []).length
  const { chips, removeChip, clearChips } = useGlobalCompanionContext()
  const { messages, isLoading, sendMessage: sendMessageRaw, stop, loadMore, hasMore } = useAgentChat(lessonId, activeSegment, lessonTitle)

  useEffect(() => {
    if (chips.length > 0)
      onTabChange?.('ai')
  }, [chips.length, onTabChange])

  function handleSend({ text, files }: { text: string, files?: import('ai').FileUIPart[] }) {
    const context = chips.map(c => `> ${c.text}`).join('\n')
    const composed = chips.length > 0 ? `Context:\n${context}\n\n${text}` : text
    captureCompanionMessageSent({ with_context: chips.length > 0, file_count: files?.length ?? 0 })
    sendMessageRaw({ text: composed, files })
    clearChips()
  }

  const headerSlot = activeSegment
    ? (
        <div className="h-10 flex items-center border-b border-border px-3 py-1.5">
          <Badge variant="secondary" className="max-w-full truncate text-sm">
            {activeSegment.text}
          </Badge>
        </div>
      )
    : undefined

  return (
    <Tabs defaultValue="ai" value={activeTab} onValueChange={onTabChange} className="flex h-full flex-col gap-0">
      <TabsList variant="line" className="w-full shrink-0 border-b border-border px-3 rounded-none h-[65px]!">
        <TabsTrigger value="ai">{t('lesson.aiCompanion')}</TabsTrigger>
        <TabsTrigger value="workbook" className="gap-1.5">
          {t('lesson.workbook')}
          {count > 0 && <Badge className="px-1.5 py-0 text-xs">{count}</Badge>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CompanionChatArea
          messages={messages}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          chips={chips}
          onRemoveChip={removeChip}
          onSend={handleSend}
          onStop={stop}
          headerSlot={headerSlot}
        />
      </TabsContent>

      <TabsContent value="workbook" className="min-h-0 flex-1 overflow-hidden">
        <LessonWorkbookPanel lessonId={lessonId} />
      </TabsContent>
    </Tabs>
  )
}
