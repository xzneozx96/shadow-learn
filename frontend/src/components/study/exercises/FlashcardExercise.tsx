import type { VocabEntry } from '@/types'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number) => void
}

export function FlashcardExercise({ entry, progress = '', onNext }: Props) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto select-none">
      {progress && (
        <div className="text-sm text-muted-foreground self-end tabular-nums">{progress}</div>
      )}

      {/* 3D flip card */}
      <div
        className="w-full cursor-pointer"
        style={{ perspective: '1200px' }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformStyle: 'preserve-3d', position: 'relative' }}
          className="w-full"
        >
          {/* Front */}
          <div
            className="w-full min-h-64 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-4 p-8"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="text-6xl font-bold tracking-wider leading-tight text-center">
              {entry.word}
            </div>
            <div className="text-sm text-muted-foreground mt-2 tracking-wide uppercase">
              {t('flashcard.reveal')}
              {' '}
              →
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl border border-primary/20 bg-card flex flex-col items-center justify-center gap-3 p-8 text-center"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="text-base text-primary/70 font-medium tracking-widest">
              {entry.romanization}
            </div>
            <div className="text-5xl font-bold tracking-wider leading-tight">
              {entry.word}
            </div>
            <div className="text-xl text-foreground font-medium">
              {entry.meaning}
            </div>
            {entry.usage && (
              <div className="text-lg text-muted-foreground max-w-xs leading-relaxed">
                {entry.usage}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Self-assessment buttons */}
      <motion.div
        initial={false}
        animate={flipped ? { opacity: 1, y: 0, pointerEvents: 'auto' } : { opacity: 0, y: 8, pointerEvents: 'none' }}
        transition={{ duration: 0.25, ease: 'easeOut', delay: flipped ? 0.2 : 0 }}
        className="flex gap-3 w-full"
      >
        <Button variant="outline" size="lg" className="flex-1" onClick={() => onNext(0)}>
          {t('flashcard.dontKnow')}
        </Button>
        <Button size="lg" className="flex-1" onClick={() => onNext(100)}>
          {t('flashcard.knew')}
        </Button>
      </motion.div>
    </div>
  )
}
