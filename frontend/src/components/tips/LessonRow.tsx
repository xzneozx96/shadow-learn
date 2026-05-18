import { Check } from 'lucide-react'
import { memo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface Props {
  videoId: string
  title: string
  duration: string
  isActive: boolean
  isCompleted: boolean
  onSelect: (videoId: string) => void
}

function LessonRowInner({ videoId, title, duration, isActive, isCompleted, onSelect }: Props) {
  const { t } = useI18n()
  return (
    <li
      role="listitem"
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex gap-2.5 px-4 py-2.5 cursor-pointer border-r-[3px] border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
      <div className="relative w-20 aspect-video shrink-0 rounded overflow-hidden bg-linear-to-br from-muted to-muted-foreground/20">
        <img
          src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className={cn(
            'absolute inset-0 size-full object-cover',
            isCompleted && 'opacity-50',
          )}
          onError={(e) => {
            // Fallback chain: mqdefault → hqdefault → hidden (gradient shows through)
            const img = e.currentTarget
            if (img.src.includes('mqdefault'))
              img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            else
              img.style.display = 'none'
          }}
        />
        {isCompleted && (
          <>
            <span aria-hidden className="absolute inset-0 bg-black/40" />
            <span
              aria-label={t('tips.lesson.completed')}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex items-center justify-center size-7 rounded-full bg-success text-white shadow-lg">
                <Check className="size-4" aria-hidden strokeWidth={3} />
              </span>
            </span>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-xs font-semibold line-clamp-2 leading-snug', isCompleted ? 'text-muted-foreground' : 'text-foreground')}>{title}</div>
        <div className="text-xs text-amber-500 mt-1 tabular-nums">{duration}</div>
      </div>
    </li>
  )
}

export const LessonRow = memo(LessonRowInner)
