import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { Check, ClipboardList, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  queue: StudyQueueState
  open: boolean
  onClick: () => void
}

// primary: hsl(235 88% 73%) = rgb(110,132,247)  success: hsl(142 76% 46%) = rgb(28,206,93)
const SHADOW_BASE = '0 0 20px rgba(110,132,247,0.7), 0 0 40px rgba(110,132,247,0.45), 0 0 60px rgba(110,132,247,0.2)'
const SHADOW_HOVER = '0 0 30px rgba(110,132,247,0.9), 0 0 50px rgba(110,132,247,0.65), 0 0 70px rgba(110,132,247,0.35)'
const SHADOW_DONE_BASE = '0 0 20px rgba(28,206,93,0.65), 0 0 40px rgba(28,206,93,0.4), 0 0 60px rgba(28,206,93,0.2)'
const SHADOW_DONE_HOVER = '0 0 30px rgba(28,206,93,0.9), 0 0 50px rgba(28,206,93,0.65), 0 0 70px rgba(28,206,93,0.35)'

export function QueueFloatingBadge({ queue, open, onClick }: Props) {
  const { t } = useI18n()

  if (queue.loading)
    return null

  const allDone = queue.allDoneToday
  const count = queue.incompleteCount

  const gradient = allDone
    ? 'linear-gradient(135deg, rgba(28,206,93,0.75) 0%, rgba(16,185,129,0.75) 100%)'
    : 'linear-gradient(135deg, rgba(110,132,247,0.85) 0%, rgba(85,105,225,0.85) 100%)'

  const shadowBase = open ? 'none' : allDone ? SHADOW_DONE_BASE : SHADOW_BASE
  const shadowHover = open ? 'none' : allDone ? SHADOW_DONE_HOVER : SHADOW_HOVER

  return (
    <div className="relative">
      {/* Ping ring */}
      {!open && (
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: allDone ? 'rgba(28,206,93,1)' : 'rgba(110,132,247,1)' }}
        />
      )}

      <motion.button
        type="button"
        onClick={onClick}
        aria-label={
          open
            ? t('queue.badge.close')
            : allDone
              ? t('queue.badge.allDone')
              : t(count !== 1 ? 'queue.badge.remaining_plural' : 'queue.badge.remaining', { count })
        }
        className="relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer border-2 border-white/20 overflow-hidden"
        style={{ background: gradient, boxShadow: shadowBase }}
        animate={{ rotate: open ? 90 : 0, boxShadow: shadowBase }}
        whileHover={{ scale: 1.1, rotate: open ? 90 : 5, boxShadow: shadowHover }}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      >
        {/* 3D top highlight */}
        <div className="absolute inset-0 rounded-full bg-linear-to-b from-white/20 to-transparent opacity-30 pointer-events-none" />
        {/* Inner glow ring */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10 pointer-events-none" />

        {/* Icon */}
        <div className="relative z-10">
          {open
            ? <X className="size-7 text-white" />
            : allDone
              ? <Check className="size-7 text-white" />
              : <ClipboardList className="size-7 text-white" />}
        </div>
      </motion.button>

      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1 -right-1 z-10 size-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center shadow-md">
          {count}
        </span>
      )}
    </div>
  )
}
