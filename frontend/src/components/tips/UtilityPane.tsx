import type { WarmingStep } from '@/hooks/useTipTranscript'
import { BookOpen, FileText, MessageSquare, NotebookPen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/contexts/I18nContext'
import { ChatTab } from './tabs/ChatTab'
import { DisabledTab } from './tabs/DisabledTab'
import { WarmingState } from './WarmingState'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error'
  warmingStep?: WarmingStep
}

type TabValue = 'notes' | 'chat' | 'cards' | 'script' | 'studio'

export function UtilityPane({ courseId, videoId, lessonTitle, transcript, transcriptStatus, warmingStep }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<TabValue>('chat')
  return (
    <aside className="flex flex-col h-full border-l border-border overflow-hidden">
      <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="flex flex-col h-full">
        <TabsList className="grid grid-cols-5 gap-0.5 m-2 bg-background">
          <TabsTrigger value="notes" aria-label={t('tips.tab.notes')}>
            <NotebookPen className="size-4" aria-hidden />
            <span className="hidden xl:inline text-xs">{t('tips.tab.notes')}</span>
          </TabsTrigger>
          <TabsTrigger value="chat" aria-label={t('tips.tab.chat')}>
            <MessageSquare className="size-4" aria-hidden />
            <span className="hidden xl:inline text-xs">{t('tips.tab.chat')}</span>
          </TabsTrigger>
          <TabsTrigger value="cards" aria-label={t('tips.tab.cards')}>
            <BookOpen className="size-4" aria-hidden />
            <span className="hidden xl:inline text-xs">{t('tips.tab.cards')}</span>
          </TabsTrigger>
          <TabsTrigger value="script" aria-label={t('tips.tab.script')}>
            <FileText className="size-4" aria-hidden />
            <span className="hidden xl:inline text-xs">{t('tips.tab.script')}</span>
          </TabsTrigger>
          <TabsTrigger value="studio" aria-label={t('tips.tab.studio')}>
            <Sparkles className="size-4" aria-hidden />
            <span className="hidden xl:inline text-xs">{t('tips.tab.studio')}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 overflow-hidden">
          {transcriptStatus === 'pending' && warmingStep
            ? <div className="p-4"><WarmingState step={warmingStep} /></div>
            : <ChatTab courseId={courseId} videoId={videoId} lessonTitle={lessonTitle} transcript={transcript} transcriptStatus={transcriptStatus} />}
        </TabsContent>
        <TabsContent value="notes" className="flex-1">
          <DisabledTab Icon={NotebookPen} labelKey="tips.placeholder.label.notes" reasonKey="tips.placeholder.notes" />
        </TabsContent>
        <TabsContent value="cards" className="flex-1">
          <DisabledTab Icon={BookOpen} labelKey="tips.placeholder.label.cards" reasonKey="tips.placeholder.cards" />
        </TabsContent>
        <TabsContent value="script" className="flex-1">
          <DisabledTab Icon={FileText} labelKey="tips.placeholder.label.script" reasonKey="tips.placeholder.script" />
        </TabsContent>
        <TabsContent value="studio" className="flex-1">
          <DisabledTab Icon={Sparkles} labelKey="tips.placeholder.label.studio" reasonKey="tips.placeholder.studio" />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
