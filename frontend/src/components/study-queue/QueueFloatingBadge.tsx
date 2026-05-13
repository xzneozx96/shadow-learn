import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { X } from 'lucide-react'
import { motion } from 'motion/react'

interface Props {
  queue: StudyQueueState
  open: boolean
  onClick: () => void
}

// hsl(235 88% 73%) → approximate RGB for glow rgba values
const PRIMARY_RGB = '110, 132, 247'
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

  const glowRgb = allDone ? EMERALD_RGB : PRIMARY_RGB
  const gradient = allDone
    ? 'linear-gradient(135deg, hsl(142, 76%, 38%) 0%, hsl(160, 70%, 48%) 100%)'
    : 'linear-gradient(135deg, hsl(235, 88%, 62%) 0%, hsl(255, 80%, 65%) 100%)'

  const baseGlow = open ? '0 4px 16px rgba(0,0,0,0.4)' : makeGlow(glowRgb)
  const hoverGlow = open ? '0 4px 20px rgba(0,0,0,0.5)' : makeGlow(glowRgb, true)

  return (
    <div className="relative">
      {/* Ambient ping ring — only when closed */}
      {!open && (
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-25"
          style={{ background: gradient }}
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
        className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold border border-white/20 overflow-hidden"
        style={{ background: open ? 'hsl(230, 20%, 20%)' : gradient }}
        animate={{ boxShadow: baseGlow }}
        whileHover={{ scale: 1.1, boxShadow: hoverGlow }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      >
        {/* Glass highlight on top half */}
        <div className="absolute inset-0 bg-linear-to-b from-white/25 to-transparent pointer-events-none" />

        {/* Icon — rotates when opening */}
        <motion.span
          className="relative z-10 flex items-center justify-center text-xl leading-none"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
        >
          {open ? <X className="size-5" /> : allDone ? '✓' : '📚'}
        </motion.span>
      </motion.button>

      {/* Count badge */}
      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-background">
          {count}
        </span>
      )}
    </div>
  )
}
