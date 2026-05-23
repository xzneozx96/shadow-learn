import type HanziWriter from 'hanzi-writer'
import type { LanguageCapabilities } from '@/shared/lib/language-caps'
import type { VocabEntry } from '@/shared/types'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useHint } from '@/features/study/application/useHint'
import { ExerciseCard } from '@/features/study/ui/exercises/ExerciseCard'
import { HintButton } from '@/features/study/ui/exercises/HintButton'
import { getDecomposition } from '@/shared/lib/hanzi/lookup'
import { Button } from '@/shared/ui/button'
import { HanziWriterCanvas } from './HanziWriterCanvas'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean }) => void
  caps: LanguageCapabilities
  writingReps: number
}

export function CharacterWritingExercise({ entry, progress = '', onNext, writingReps }: Props) {
  const { t } = useI18n()
  const characters = [...entry.word]
  const [charIndex, setCharIndex] = useState(0)
  // Use a ref (not state) for anyHintUsed to avoid stale closures in advance().
  const anyHintUsedRef = useRef(false)
  const writerRef = useRef<HanziWriter | null>(null)

  const [blankRep, setBlankRep] = useState(0)
  const [hintShown, setHintShown] = useState(false)

  const currentChar = characters[charIndex]
  const charProgress = `${charIndex + 1} / ${characters.length}`

  const radicalHint = useHint(1)
  const [radicals, setRadicals] = useState<string[]>([])
  useEffect(() => {
    let cancel = false
    getDecomposition(currentChar)
      .then((comps) => {
        if (!cancel)
          setRadicals(comps.map(c => c.char).filter(c => c !== currentChar))
      })
      .catch(() => {
        if (!cancel)
          setRadicals([])
      })
    return () => { cancel = true }
  }, [currentChar])
  const showRadicals = radicals.length > 0

  function handleComplete(usedHint: boolean) {
    if (usedHint)
      anyHintUsedRef.current = true

    if (blankRep < writingReps - 1) {
      setBlankRep(blankRep + 1)
    }
    else {
      advance()
    }
  }

  function advance() {
    const finalScore = Math.round((anyHintUsedRef.current ? 80 : 100) * radicalHint.hintScore)
    radicalHint.reset()
    setCharIndex((idx) => {
      const next = idx + 1
      if (next >= characters.length) {
        // Use setTimeout to call onNext outside the setState cycle
        setTimeout(onNext, 0, finalScore)
        return idx
      }
      return next
    })
    setBlankRep(0)
    setHintShown(false)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="lg" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {showRadicals && (
        <HintButton
          level={radicalHint.level}
          totalLevels={1}
          exhausted={radicalHint.exhausted}
          onHint={radicalHint.revealNext}
        />
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
      <div className="text-center mb-3 space-y-0.5">
        <p className="text-xs text-muted-foreground/60">
          {characters.length > 1 && charProgress}
          {writingReps > 1 && ` · ${blankRep + 1} / ${writingReps}`}
        </p>
      </div>

      {/* Radical hint */}
      {showRadicals && radicalHint.level > 0 && (
        <div className="flex justify-center gap-2 mb-3">
          {radicals.map(r => (
            <span
              key={r}
              className="flex flex-col items-center px-3 py-2 rounded-lg border border-border bg-muted/20 text-center"
            >
              <span className="text-xl">{r}</span>
            </span>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="flex justify-center mb-2">
        <HanziWriterCanvas
          key={`${entry.id}-${charIndex}-${blankRep}-${hintShown}`}
          character={currentChar}
          writerRef={writerRef}
          onComplete={handleComplete}
          showOutline={hintShown}
        />
      </div>
    </ExerciseCard>
  )
}
