import type { ContextChip } from '@/components/chat/ContextChipBar'
import type { WarmingStep } from '@/hooks/useTipTranscript'
import { Clock, FileText, MessageSquare, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTipNotes } from '@/hooks/useTipNotes'
import { OverviewBlock } from './OverviewBlock'
import { ChatTab } from './tabs/ChatTab'
import { StudioTab } from './tabs/StudioTab'
import { WarmingState } from './WarmingState'

interface Props {
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  transcriptStatus: 'pending' | 'ready' | 'unavailable' | 'error' | 'too_long'
  warmingStep?: WarmingStep
  /**
   * False while the first IDB read for this video is still in flight.
   * Suppresses the WarmingState flash on cached videos — the hook
   * defaults transcriptStatus to 'pending' before hydration, which would
   * otherwise render the warming UI for one frame even when IDB already
   * has the transcript ready.
   */
  transcriptHydrated?: boolean
}

type TabValue = 'summary' | 'chat' | 'studio'

export function UtilityPane({ courseId, videoId, lessonTitle, transcript, transcriptStatus, warmingStep, transcriptHydrated = true }: Props) {
  const { t } = useI18n()
  const { db } = useAuth()
  const notesDeck = useTipNotes({ db, videoId })
  const [tab, setTab] = useState<TabValue>('summary')
  const [chips, setChips] = useState<ContextChip[]>([])
  const addChip = (text: string, source?: string) =>
    setChips(prev => [...prev, { id: crypto.randomUUID(), text, source }])
  const removeChip = (id: string) =>
    setChips(prev => prev.filter(c => c.id !== id))
  const clearChips = () => setChips([])

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
  //
  // Show this as soon as status flips to 'pending' — don't wait for the
  // first job-poll response to populate `warmingStep`, otherwise the user
  // sees stale tabs for a few seconds after switching to a new video.
  // Pre-hydration the hook defaults to status='pending' even when IDB will
  // soon resolve to 'ready' — render an empty shell during that window so
  // cached videos don't flash WarmingState for one frame on every mount.
  if (transcriptStatus === 'pending' && !transcriptHydrated) {
    return <aside className="flex flex-col h-full border-l border-border overflow-hidden" />
  }

  if (transcriptStatus === 'pending') {
    return (
      <aside className="flex flex-col h-full border-l border-border overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <WarmingState step={warmingStep ?? 'video_download'} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex flex-col h-full border-l border-border overflow-hidden">
      <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="flex flex-col h-full gap-0">
        <TabsList variant="line" className="w-full shrink-0 border-b border-border rounded-none h-13!">
          <TabsTrigger value="summary" aria-label={t('tips.tab.summary')}>
            <FileText className="size-4" aria-hidden />
            <span className="text-sm">{t('tips.tab.summary')}</span>
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
        <TabsContent value="summary" className="flex-1 overflow-y-auto p-3">
          <OverviewBlock videoId={videoId} transcript={transcript} transcriptStatus={transcriptStatus} />
        </TabsContent>
        <TabsContent value="chat" className="flex-1 overflow-hidden">
          <ChatTab
            courseId={courseId}
            videoId={videoId}
            lessonTitle={lessonTitle}
            transcript={transcript}
            transcriptStatus={transcriptStatus}
            chips={chips}
            onRemoveChip={removeChip}
            onClearChips={clearChips}
          />
        </TabsContent>
        <TabsContent value="studio" className="flex-1 overflow-y-auto">
          <StudioTab
            courseId={courseId}
            videoId={videoId}
            lessonTitle={lessonTitle}
            transcript={transcript}
            transcriptStatus={transcriptStatus}
            notes={notesDeck.notes}
            notesHydrated={notesDeck.hydrated}
            onCreateNote={notesDeck.create}
            onUpdateNote={notesDeck.update}
            onRemoveNote={notesDeck.remove}
            onDiscussNote={(text) => {
              addChip(text, 'note')
              setTab('chat')
            }}
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
