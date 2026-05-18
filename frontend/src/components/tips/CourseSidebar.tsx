import type { TipLesson } from '@/types'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/contexts/I18nContext'
import { LessonRow } from './LessonRow'

interface Props {
  courseName: string
  topic: string | null
  lessons: TipLesson[]
  activeVideoId: string
  completedVideoIds: Set<string>
  inProgressVideoIds?: Set<string>
  onSelect: (videoId: string) => void
}

export function CourseSidebar({ courseName, lessons, activeVideoId, completedVideoIds, inProgressVideoIds, onSelect }: Props) {
  const { t } = useI18n()
  const completed = lessons.reduce((n, l) => n + (completedVideoIds.has(l.videoId) ? 1 : 0), 0)
  const pct = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100)
  const progressCount = `${completed} / ${lessons.length}`
  const progressPct = `${pct}%`
  const navLabel = t('tips.sidebar.aria')
  const backLabel = t('tips.sidebar.back', { course: courseName })

  return (
    <nav aria-label={navLabel} className="flex flex-col h-full border-r border-border">
      <header className="px-3 py-5 border-b border-border shrink-0">
        <Link
          to="/collection?tab=tips"
          aria-label={backLabel}
          className="group flex items-start gap-1.5 text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
        >
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
          <h2 className="text-sm font-bold leading-snug">{courseName}</h2>
        </Link>
      </header>
      <ol role="list" className="flex-1 overflow-y-auto">
        {lessons.map(l => (
          <LessonRow
            key={l.videoId}
            videoId={l.videoId}
            title={l.title}
            duration={l.duration}
            isActive={l.videoId === activeVideoId}
            isCompleted={completedVideoIds.has(l.videoId)}
            isInProgress={inProgressVideoIds?.has(l.videoId) ?? false}
            onSelect={onSelect}
          />
        ))}
      </ol>
      <footer className="px-3 py-5 border-t border-border bg-card/40 shrink-0">
        <div className="flex justify-between text-sm font-bold text-muted-foreground mb-1.5 tabular-nums">
          <span>{progressCount}</span>
          <span>{progressPct}</span>
        </div>
        <div className="h-2 rounded bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded transition-all" style={{ width: `${pct}%` }} />
        </div>
      </footer>
    </nav>
  )
}
