import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { Check, ClipboardList, X } from 'lucide-react'
import { motion } from 'motion/react'

interface Props {
  queue: StudyQueueState
  open: boolean
  onClick: () => void
}

// amber-400 ≈ rgb(251,191,36)  |  success/emerald ≈ rgb(52,211,153)
const AMBER_RGB = '251, 191, 36'
const EMERALD_RGB = '52, 211, 153'

function makeGlow(rgb: string, strong = false) {
  return strong
    ? `0 0 20px rgba(${rgb}, 0.85), 0 0 40px rgba(${rgb}, 0.55), 0 0 64px rgba(${rgb}, 0.28)`
    : `0 0 14px rgba(${rgb}, 0.55), 0 0 28px rgba(${rgb}, 0.3), 0 0 48px rgba(${rgb}, 0.14)`
}

export function QueueFloatingBadge({ queue, open, onClick }: Props) {
  if (queue.loading)
    return null

  const allDone = queue.allDoneToday
  const count = queue.incompleteCount

  const glowRgb = allDone ? EMERALD_RGB : AMBER_RGB
  const baseGlow = open ? '0 4px 16px rgba(0,0,0,0.4)' : makeGlow(glowRgb)
  const hoverGlow = open ? '0 4px 20px rgba(0,0,0,0.5)' : makeGlow(glowRgb, true)

  const bgOpen = 'hsl(230, 20%, 16%)'
  const bgNormal = allDone
    ? 'linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(52,211,153,0.05) 100%)'
    : 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.05) 100%)'

  return (
    <div className="relative">
      {/* Ping ring */}
      {!open && (
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: bgNormal }}
        />
      )}

      <motion.button
        type="button"
        onClick={onClick}
        aria-label={
          open
            ? 'Close study queue'
            : allDone
              ? 'All done today'
              : `${count} study item${count !== 1 ? 's' : ''} remaining`
        }
        className="group w-16 h-16 rounded-full flex items-center justify-center cursor-pointer"
        style={{ background: open ? bgOpen : bgNormal }}
        animate={{ boxShadow: baseGlow }}
        whileHover={{ scale: 1.1, boxShadow: hoverGlow }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      >
        {open
          ? <X className="size-6 text-muted-foreground transition-transform duration-300 group-hover:rotate-90 group-hover:scale-110" />
          : allDone
            ? <Check className="size-6 text-emerald-400 transition-transform duration-300 group-hover:scale-110" />
            : <ClipboardList className="size-6 text-amber-400 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />}
      </motion.button>

      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-background">
          {count}
        </span>
      )}
    </div>
  )
}
