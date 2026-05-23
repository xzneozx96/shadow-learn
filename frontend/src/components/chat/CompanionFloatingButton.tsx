import { Sparkles, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  open: boolean
  onClick: () => void
}

// amber: rgb(251,191,36) → rgb(217,119,6)
const SHADOW_BASE = '0 0 20px rgba(251,191,36,0.7), 0 0 40px rgba(251,191,36,0.45), 0 0 60px rgba(251,191,36,0.2)'
const SHADOW_HOVER = '0 0 30px rgba(251,191,36,0.9), 0 0 50px rgba(251,191,36,0.65), 0 0 70px rgba(251,191,36,0.35)'

const GRADIENT = 'linear-gradient(135deg, rgba(251,191,36,0.85) 0%, rgba(217,119,6,0.85) 100%)'

export function CompanionFloatingButton({ open, onClick }: Props) {
  const { t } = useI18n()

  const shadowBase = open ? 'none' : SHADOW_BASE
  const shadowHover = open ? 'none' : SHADOW_HOVER

  return (
    <div className="relative">
      {/* Ping ring */}
      {!open && (
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: 'rgba(251,191,36,1)' }}
        />
      )}

      <motion.button
        type="button"
        onClick={onClick}
        aria-label={open ? t('companion.title') : t('companion.askButton')}
        className="relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer border-2 border-white/20 overflow-hidden"
        style={{ background: GRADIENT, boxShadow: shadowBase }}
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
            : <Sparkles className="size-7 text-white" />}
        </div>
      </motion.button>
    </div>
  )
}
