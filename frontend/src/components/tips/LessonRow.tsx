import { Check } from 'lucide-react'
import { memo } from 'react'
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
  return (
    <li
      role="listitem"
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex gap-2.5 px-4 py-2.5 cursor-pointer border-l-[3px] border-transparent transition-colors',
        isActive && 'bg-primary/10 border-l-primary',
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
      <div className="relative size-14 shrink-0 rounded bg-gradient-to-br from-muted to-muted-foreground/20">
        {isCompleted && (
          <span
            aria-label="Completed"
            className="absolute bottom-0.5 right-0.5 flex items-center justify-center size-3.5 rounded-full bg-success text-white"
          >
            <Check className="size-2.5" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-xs font-semibold line-clamp-2 leading-snug', isCompleted ? 'text-muted-foreground' : 'text-foreground')}>{title}</div>
        <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{duration}</div>
      </div>
    </li>
  )
}

export const LessonRow = memo(LessonRowInner)
