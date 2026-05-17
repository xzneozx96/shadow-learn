import type { WarmingStep } from '@/hooks/useTipTranscript'
import { BookOpen, FileText, MessageSquare, NotebookPen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const [tab, setTab] = useState<TabValue>('chat')
  return (
    <aside className="flex flex-col h-full bg-card border-l border-border overflow-hidden">
      <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="flex flex-col h-full">
        <TabsList className="grid grid-cols-5 gap-0.5 m-2 bg-background">
          <TabsTrigger value="notes" aria-label="Notes">
            <NotebookPen className="size-4" aria-hidden />
            <span className="hidden xl:inline ml-1.5 text-[11px]">Notes</span>
          </TabsTrigger>
          <TabsTrigger value="chat" aria-label="Chat">
            <MessageSquare className="size-4" aria-hidden />
            <span className="hidden xl:inline ml-1.5 text-[11px]">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="cards" aria-label="Cards">
            <BookOpen className="size-4" aria-hidden />
            <span className="hidden xl:inline ml-1.5 text-[11px]">Cards</span>
          </TabsTrigger>
          <TabsTrigger value="script" aria-label="Script">
            <FileText className="size-4" aria-hidden />
            <span className="hidden xl:inline ml-1.5 text-[11px]">Script</span>
          </TabsTrigger>
          <TabsTrigger value="studio" aria-label="Studio">
            <Sparkles className="size-4" aria-hidden />
            <span className="hidden xl:inline ml-1.5 text-[11px]">Studio</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 overflow-hidden">
          {transcriptStatus === 'pending' && warmingStep
            ? <div className="p-4"><WarmingState step={warmingStep} /></div>
            : <ChatTab courseId={courseId} videoId={videoId} lessonTitle={lessonTitle} transcript={transcript} transcriptStatus={transcriptStatus} />}
        </TabsContent>
        <TabsContent value="notes" className="flex-1"><DisabledTab Icon={NotebookPen} label="Notes" reason="Markdown editor with timestamp insert lands in B2." /></TabsContent>
        <TabsContent value="cards" className="flex-1"><DisabledTab Icon={BookOpen} label="Flashcards" reason="Auto-generated cards push to the Workbook in B2." /></TabsContent>
        <TabsContent value="script" className="flex-1"><DisabledTab Icon={FileText} label="Transcript" reason="Click-to-seek transcript with citations lands in B3." /></TabsContent>
        <TabsContent value="studio" className="flex-1"><DisabledTab Icon={Sparkles} label="Studio" reason="Summary, study guide, mind map, and Socratic quiz land in B2." /></TabsContent>
      </Tabs>
    </aside>
  )
}
