import type { VocabEntry } from '@/shared/types'
import { motion } from 'motion/react'
import { useState } from 'react'
import { FlipCard } from '@/components/library/FlipCard'
import { useI18n } from '@/contexts/I18nContext'
import { Button } from '@/shared/ui/button'

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

      <FlipCard
        className="w-full"
        animationDuration={500}
        easing="cubic-bezier(0.16, 1, 0.3, 1)"
        scaleOnPress
        onFlippedChange={(v) => {
          if (v)
            setFlipped(true)
        }}
      >
        {!flipped && <FlipCard.Trigger />}
        <FlipCard.Front className="w-full min-h-64 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-4 p-8">
          <div className="text-6xl font-bold tracking-wider leading-tight text-center">
            {entry.word}
          </div>
          <div className="text-sm text-muted-foreground mt-2 tracking-wide uppercase">
            {t('flashcard.reveal')}
            {' '}
            →
          </div>
        </FlipCard.Front>
        <FlipCard.Back className="w-full min-h-64 rounded-2xl border border-primary/20 bg-card flex flex-col items-center justify-center gap-3 p-8 text-center">
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
        </FlipCard.Back>
      </FlipCard>

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
