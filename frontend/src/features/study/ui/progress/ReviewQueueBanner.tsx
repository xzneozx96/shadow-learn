import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'

interface Props {
  count: number
  onStartReview: () => void
}

export function ReviewQueueBanner({ count, onStartReview }: Props) {
  const { t } = useI18n()

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-xl px-6 py-5 flex items-center justify-between shadow-sm group">
            <div className="absolute inset-0 bg-linear-to-r from-emerald-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">{t('progress.spacedRepetition')}</h3>
              <p className="text-sm font-medium text-emerald-700/80 dark:text-emerald-300/80 mt-1">
                {`${count} ${count === 1 ? t('progress.itemDue') : t('progress.itemsDue')}`}
              </p>
            </div>
            <Button
              size="lg"
              className="relative z-10 bg-emerald-600 hover:bg-emerald-500 text-white shadow duration-300"
              onClick={onStartReview}
            >
              {t('progress.startReview')}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
