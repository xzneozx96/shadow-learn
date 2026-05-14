import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number) => void
}

export function FlashcardExercise({ entry, progress = '', onNext }: Props) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)

  const footer = flipped
    ? (
        <div className="flex gap-2 w-full">
          <Button variant="outline" className="flex-1" onClick={() => onNext(0)}>
            {t('flashcard.dontKnow')}
          </Button>
          <Button className="flex-1" onClick={() => onNext(100)}>
            {t('flashcard.knew')}
          </Button>
        </div>
      )
    : (
        <Button className="w-full" onClick={() => setFlipped(true)}>
          {t('flashcard.reveal')}
        </Button>
      )

  return (
    <ExerciseCard
      type={t('study.mode.flashcard')}
      progress={progress}
      footer={footer}
    >
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="text-5xl font-bold tracking-wider">{entry.word}</div>
        {flipped && (
          <div className={cn('flex flex-col items-center gap-2 animate-in fade-in duration-200')}>
            <div className="text-lg text-muted-foreground">{entry.romanization}</div>
            <div className="text-base text-center">{entry.meaning}</div>
          </div>
        )}
      </div>
    </ExerciseCard>
  )
}
