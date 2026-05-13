import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { Check, ClipboardList, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  queue: StudyQueueState
  open: boolean
  onClick: () => void
}

export function QueueFloatingBadge({ queue, open, onClick }: Props) {
  if (queue.loading)
    return null

  const allDone = queue.allDoneToday
  const count = queue.incompleteCount

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={
          open
            ? 'Close study queue'
            : allDone
              ? 'All done today'
              : `${count} study item${count !== 1 ? 's' : ''} remaining`
        }
        className={cn(
          'group w-16 h-16 rounded-full flex items-center justify-center',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'active:scale-[0.94] cursor-pointer',
          open
            ? 'bg-linear-to-br from-muted/60 to-muted/30 hover:from-muted/80'
            : allDone
              ? 'bg-linear-to-br from-success/10 to-success/5 animate-breathe-success hover:from-success/15 hover:to-success/8'
              : 'bg-linear-to-br from-amber-400/10 to-amber-500/5 animate-breathe-amber hover:from-amber-400/15 hover:to-amber-500/8',
        )}
      >
        {open
          ? <X className="size-6 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-90 group-hover:scale-110" />
          : allDone
            ? <Check className="size-6 text-success transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110" />
            : <ClipboardList className="size-6 text-amber-400 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:-translate-y-0.5" />}
      </button>

      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-background">
          {count}
        </span>
      )}
    </div>
  )
}
