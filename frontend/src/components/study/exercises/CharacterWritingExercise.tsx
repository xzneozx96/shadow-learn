import type HanziWriter from 'hanzi-writer'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useRef, useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { animateCharacter } from '../../../lib/hanzi-writer-utils'
import { HanziWriterCanvas } from './HanziWriterCanvas'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean }) => void
  caps: LanguageCapabilities
}

export function CharacterWritingExercise({ entry, progress = '', onNext }: Props) {
  const { t } = useI18n()
  const characters = [...entry.word]
  const [charIndex, setCharIndex] = useState(0)
  const [hintAnimating, setHintAnimating] = useState(false)
  // Use a ref (not state) for anyHintUsed to avoid stale closures in advance().
  const anyHintUsedRef = useRef(false)
  const writerRef = useRef<HanziWriter | null>(null)

  const currentChar = characters[charIndex]
  const charProgress = `${charIndex + 1} / ${characters.length}`

  function handleComplete(usedHint: boolean) {
    if (usedHint)
      anyHintUsedRef.current = true
    setHintAnimating(false)
    advance()
  }

  function advance() {
    setCharIndex((idx) => {
      const next = idx + 1
      if (next >= characters.length) {
        // Use setTimeout to call onNext outside the setState cycle
        setTimeout(onNext, 0, anyHintUsedRef.current ? 80 : 100)
        return idx
      }
      return next
    })
  }

  function handleHint() {
    anyHintUsedRef.current = true
    setHintAnimating(true)
    animateCharacter(writerRef, () => setHintAnimating(false))
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {hintAnimating
        ? (
            <Button size="sm" onClick={advance}>{t('study.writing.continueButton')}</Button>
          )
        : (
            <Button variant="outline" size="sm" onClick={handleHint}>{t('study.writing.hint')}</Button>
          )}
    </div>
  )

  return (
    <ExerciseCard
      type={t('study.mode.writing')}
      progress={progress}
      footer={footer}
      info={t('study.exercise.writing.info')}
    >
      {/* Prompt */}
      <div className="text-center mb-4">
        <p className="text-sm text-muted-foreground">{entry.meaning}</p>
        {entry.romanization && <p className="text-sm text-muted-foreground/60 mt-1">{entry.romanization}</p>}
      </div>

      {/* Character progress */}
      <p className="text-sm text-center text-muted-foreground mb-3">{charProgress}</p>

      {/* Canvas */}
      <div className="flex justify-center mb-2">
        <HanziWriterCanvas
          key={`${entry.id}-${charIndex}`}
          character={currentChar}
          writerRef={writerRef}
          onComplete={handleComplete}
        />
      </div>
    </ExerciseCard>
  )
}
