import type { WarmingStep } from '@/hooks/useTipTranscript'
import { Clock, MessageSquare, NotebookPen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/contexts/I18nContext'
import { ChatTab } from './tabs/ChatTab'
import { DisabledTab } from './tabs/DisabledTab'
import { StudioTab } from './tabs/StudioTab'
import { WarmingState } from './WarmingState'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error' | 'too_long'
  warmingStep?: WarmingStep
}

type TabValue = 'notes' | 'chat' | 'studio'

export function UtilityPane({ courseId, videoId, lessonTitle, transcript, transcriptStatus, warmingStep }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<TabValue>('chat')

  // Video too long: no transcript will ever exist. Take over the pane with
  // a clear explanation rather than showing tabs that all silently disable.
  if (transcriptStatus === 'too_long') {
    return (
      <aside className="flex flex-col h-full border-l border-border overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Clock className="size-10 text-muted-foreground" aria-hidden />
          <div className="text-sm font-bold text-foreground">{t('tips.video.tooLong.title')}</div>
          <div className="text-xs text-muted-foreground max-w-[280px]">{t('tips.video.tooLong.body')}</div>
        </div>
      </aside>
    )
  }

  // While the transcript pipeline is processing, the right pane shows ONLY
  // the warming state. Tabs would all be non-functional (no transcript →
  // chat disabled, studio disabled, notes is a B3 placeholder). Hiding
  // them removes the "why is this empty" confusion.
  if (transcriptStatus === 'pending' && warmingStep) {
    return (
      <aside className="flex flex-col h-full border-l border-border overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <WarmingState step={warmingStep} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex flex-col h-full border-l border-border overflow-hidden">
      <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="flex flex-col h-full gap-0">
        <TabsList variant="line" className="w-full shrink-0 border-b border-border px-3 rounded-none h-[65px]!">
          <TabsTrigger value="notes" aria-label={t('tips.tab.notes')}>
            <NotebookPen className="size-4" aria-hidden />
            <span className="text-sm">{t('tips.tab.notes')}</span>
          </TabsTrigger>
          <TabsTrigger value="chat" aria-label={t('tips.tab.chat')}>
            <MessageSquare className="size-4" aria-hidden />
            <span className="text-sm">{t('tips.tab.chat')}</span>
          </TabsTrigger>
          <TabsTrigger value="studio" aria-label={t('tips.tab.studio')}>
            <Sparkles className="size-4" aria-hidden />
            <span className="text-sm">{t('tips.tab.studio')}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 overflow-hidden">
          <ChatTab courseId={courseId} videoId={videoId} lessonTitle={lessonTitle} transcript={transcript} transcriptStatus={transcriptStatus} />
        </TabsContent>
        <TabsContent value="notes" className="flex-1">
          <DisabledTab Icon={NotebookPen} labelKey="tips.placeholder.label.notes" reasonKey="tips.placeholder.notes" />
        </TabsContent>
        <TabsContent value="studio" className="flex-1 overflow-y-auto">
          <StudioTab
            courseId={courseId}
            videoId={videoId}
            lessonTitle={lessonTitle}
            transcript={transcript}
            transcriptStatus={transcriptStatus}
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
