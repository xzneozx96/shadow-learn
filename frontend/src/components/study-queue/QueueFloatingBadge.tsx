import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { Check, ClipboardList, X } from 'lucide-react'
import { motion } from 'motion/react'

interface Props {
  queue: StudyQueueState
  open: boolean
  onClick: () => void
}

const SHADOW_BASE = '0 0 20px rgba(110,132,247,0.7), 0 0 40px rgba(124,58,237,0.5), 0 0 60px rgba(109,40,217,0.3)'
const SHADOW_HOVER = '0 0 30px rgba(110,132,247,0.9), 0 0 50px rgba(124,58,237,0.7), 0 0 70px rgba(109,40,217,0.5)'
const SHADOW_DONE_BASE = '0 0 20px rgba(52,211,153,0.65), 0 0 40px rgba(16,185,129,0.45), 0 0 60px rgba(5,150,105,0.25)'
const SHADOW_DONE_HOVER = '0 0 30px rgba(52,211,153,0.9), 0 0 50px rgba(16,185,129,0.65), 0 0 70px rgba(5,150,105,0.4)'

export function QueueFloatingBadge({ queue, open, onClick }: Props) {
  if (queue.loading)
    return null

  const allDone = queue.allDoneToday
  const count = queue.incompleteCount

  const gradient = open
    ? 'linear-gradient(135deg, rgba(30,32,48,0.9) 0%, rgba(20,22,36,0.95) 100%)'
    : allDone
      ? 'linear-gradient(135deg, rgba(52,211,153,0.75) 0%, rgba(16,185,129,0.75) 100%)'
      : 'linear-gradient(135deg, rgba(110,132,247,0.8) 0%, rgba(168,85,247,0.8) 100%)'

  const shadowBase = open ? 'none' : allDone ? SHADOW_DONE_BASE : SHADOW_BASE
  const shadowHover = open ? 'none' : allDone ? SHADOW_DONE_HOVER : SHADOW_HOVER

  return (
    <div className="relative">
      {/* Ping ring */}
      {!open && (
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: allDone ? 'rgba(52,211,153,1)' : 'rgba(99,102,241,1)' }}
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
            ? <X className="size-7 text-white/80" />
            : allDone
              ? <Check className="size-7 text-white" />
              : <ClipboardList className="size-7 text-white" />}
        </div>
      </motion.button>

      {!open && !allDone && count > 0 && (
        <span className="absolute -top-1 -right-1 z-10 min-w-[20px] h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1.5 border-2 border-background">
          {count}
        </span>
      )}
    </div>
  )
}
