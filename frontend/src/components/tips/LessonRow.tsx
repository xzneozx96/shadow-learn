import { Check, ClockFading, Play } from 'lucide-react'
import { memo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface Props {
  videoId: string
  title: string
  duration: string
  isActive: boolean
  isCompleted: boolean
  isInProgress?: boolean
  onSelect: (videoId: string) => void
  titleLoading?: boolean
}

function LessonRowInner({ videoId, title, duration, isActive, isCompleted, isInProgress = false, onSelect, titleLoading = false }: Props) {
  const { t } = useI18n()
  let badge: 'playing' | 'completed' | 'in_progress' | null = null
  if (isActive)
    badge = 'playing'
  else if (isCompleted)
    badge = 'completed'
  else if (isInProgress)
    badge = 'in_progress'

  let badgeLabel = ''
  if (badge === 'playing')
    badgeLabel = t('tips.lesson.playing')
  else if (badge === 'completed')
    badgeLabel = t('tips.lesson.completed')
  else if (badge === 'in_progress')
    badgeLabel = t('tips.lesson.inProgress')

  return (
    <li
      role="listitem"
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 cursor-pointer border-r-[3px] border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        isActive && 'bg-primary/10 border-r-primary',
        !isActive && 'hover:bg-card',
      )}
      onClick={() => onSelect(videoId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(videoId)
        }
      }}
      tabIndex={0}
    >
      <span
        aria-label={badgeLabel || undefined}
        className={cn(
          'flex items-center justify-center size-6 shrink-0 rounded-full ring-1 ring-inset',
          badge === 'playing' && 'bg-primary text-primary-foreground ring-primary/40',
          badge === 'completed' && 'bg-success text-white ring-success/40',
          badge === 'in_progress' && 'bg-amber-500 text-white ring-amber-500/40',
          !badge && 'bg-muted/60 text-muted-foreground ring-border',
        )}
      >
        {badge === 'playing' && <Play className="size-3" aria-hidden fill="currentColor" />}
        {badge === 'completed' && <Check className="size-3" aria-hidden strokeWidth={3} />}
        {badge === 'in_progress' && <ClockFading className="size-3" aria-hidden />}
        {!badge && <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-hidden />}
      </span>

      <div className="flex-1 min-w-0">
        {titleLoading
          ? <span className="inline-block h-3.5 w-40 rounded bg-muted animate-pulse" aria-hidden />
          : (
              <div className={cn(
                'text-xs font-semibold line-clamp-2 leading-snug',
                isActive ? 'text-primary' : isCompleted ? 'text-muted-foreground' : 'text-foreground',
              )}
              >
                {title}
              </div>
            )}
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{duration}</span>
    </li>
  )
}

export const LessonRow = memo(LessonRowInner)
