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
          'group relative w-12 h-12 rounded-xl flex items-center justify-center',
          'border transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'active:scale-[0.94] cursor-pointer',
          open
            ? 'bg-linear-to-br from-muted/60 to-muted/30 border-border/40 hover:from-muted/80 hover:border-border/60'
            : allDone
              ? 'bg-linear-to-br from-success/10 to-success/5 border-success/25 animate-breathe-success hover:from-success/15 hover:to-success/8 hover:border-success/40'
              : 'bg-linear-to-br from-primary/10 to-primary/5 border-primary/25 animate-breathe-primary hover:from-primary/15 hover:to-primary/8 hover:border-primary/40',
        )}
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shrink-0',
            open
              ? 'bg-muted/50 ring-border/30'
              : allDone
                ? 'bg-success/20 ring-success/35'
                : 'bg-primary/20 ring-primary/35',
          )}
        >
          {open
            ? (
                <X className="size-4 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-90 group-hover:scale-110" />
              )
            : allDone
              ? (
                  <Check className="size-4 text-success transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110" />
                )
              : (
                  <ClipboardList className="size-4 text-primary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:-translate-y-0.5" />
                )}
        </span>
      </button>

      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-background">
          {count}
        </span>
      )}
    </div>
  )
}
