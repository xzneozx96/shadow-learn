import type { TipLesson } from '@/features/learning-materials/domain/tips'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
  // True while the standalone-video branch is fetching YouTube metadata.
  // Renders a title-bar skeleton + lesson-row skeletons during the gap.
  metaLoading?: boolean
}

export function CourseSidebar({ courseName, lessons, activeVideoId, completedVideoIds, inProgressVideoIds, onSelect, metaLoading = false }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const completed = lessons.reduce((n, l) => n + (completedVideoIds.has(l.videoId) ? 1 : 0), 0)
  const pct = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100)
  const progressCount = `${completed} / ${lessons.length}`
  const progressPct = `${pct}%`
  const navLabel = t('tips.sidebar.aria')
  const backLabel = t('tips.sidebar.back', { course: courseName })

  const handleBack = () => {
    if (window.history.length > 1)
      navigate(-1)
    else
      navigate('/collection')
  }

  return (
    <nav aria-label={navLabel} className="flex flex-col h-full border-r border-border">
      <header className="px-3 py-3.5 border-b border-border shrink-0">
        <button
          type="button"
          onClick={handleBack}
          aria-label={backLabel}
          className="group flex items-center gap-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors text-left"
        >
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
          {metaLoading
            ? <span className="inline-block h-4 w-32 rounded bg-muted animate-pulse" aria-hidden />
            : <h4 className="text-sm font-bold leading-snug">{courseName}</h4>}
        </button>
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
            titleLoading={metaLoading}
          />
        ))}
      </ol>
      <footer className="px-3 py-3 border-t border-border bg-card/40 shrink-0">
        <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1.5 tabular-nums">
          <span>{progressCount}</span>
          <span>{progressPct}</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </footer>
    </nav>
  )
}
