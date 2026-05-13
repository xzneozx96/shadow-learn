import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { cn } from '@/lib/utils'

interface Props {
  queue: StudyQueueState
  onClick: () => void
}

export function QueueFloatingBadge({ queue, onClick }: Props) {
  if (queue.loading)
    return null

  const allDone = queue.allDoneToday
  const count = queue.incompleteCount

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed bottom-6 right-6 z-40 w-12 h-12 rounded-2xl',
        'flex items-center justify-center',
        'text-white font-bold shadow-lg',
        'transition-transform hover:scale-105 active:scale-95',
        allDone
          ? 'bg-emerald-500 shadow-emerald-500/25'
          : 'bg-primary shadow-primary/25',
      )}
      aria-label={allDone
        ? 'All done today'
        : `${count} study item${count !== 1 ? 's' : ''} remaining`}
    >
      {allDone ? '✓' : '📚'}
      {!allDone && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-background">
          {count}
        </span>
      )}
    </button>
  )
}
