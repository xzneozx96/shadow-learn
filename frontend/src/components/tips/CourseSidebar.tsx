import type { TipLesson } from '@/types'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { LessonRow } from './LessonRow'

interface Props {
  courseName: string
  topic: string | null
  lessons: TipLesson[]
  activeVideoId: string
  completedVideoIds: Set<string>
  onSelect: (videoId: string) => void
}

export function CourseSidebar({ courseName, lessons, activeVideoId, completedVideoIds, onSelect }: Props) {
  const completed = lessons.reduce((n, l) => n + (completedVideoIds.has(l.videoId) ? 1 : 0), 0)
  const pct = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100)
  const lessonCount = `${lessons.length} lessons`
  const progressCount = `${completed} / ${lessons.length}`

  return (
    <nav aria-label="Course lessons" className="flex flex-col h-full bg-background border-r border-border overflow-y-auto">
      <header className="px-4 pt-4 pb-4 border-b border-border">
        <Link
          to="/collection?tab=tips"
          aria-label="Back to Tips collection"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Back
        </Link>
        <h2 className="text-base font-bold text-foreground leading-tight mb-2">{courseName}</h2>
        <Badge variant="secondary" className="text-[10px] font-semibold">
          {lessonCount}
        </Badge>
      </header>
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[11px] text-muted-foreground mb-1.5 tabular-nums">{progressCount}</div>
        <div className="h-[5px] rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="py-2" role="list">
        {lessons.map(l => (
          <LessonRow
            key={l.videoId}
            videoId={l.videoId}
            title={l.title}
            duration={l.duration}
            isActive={l.videoId === activeVideoId}
            isCompleted={completedVideoIds.has(l.videoId)}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </nav>
  )
}
