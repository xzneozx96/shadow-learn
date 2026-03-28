import type HanziWriter from 'hanzi-writer'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import hanzi from 'hanzi'
import { useMemo, useRef, useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { HintButton } from '@/components/study/exercises/HintButton'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useHint } from '@/hooks/useHint'
import { animateCharacter } from '../../../lib/hanzi-writer-utils'
import { HanziWriterCanvas } from './HanziWriterCanvas'

// Module-level init — hanzi guards against double-init
try {
  hanzi.start()
}
catch { /* ignore */ }

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
  const [hintAnimating, setHintAnimating] = useState(false)
  // Use a ref (not state) for anyHintUsed to avoid stale closures in advance().
  const anyHintUsedRef = useRef(false)
  const writerRef = useRef<HanziWriter | null>(null)

  type WritingStage = 'guided' | 'blank'
  const [stage, setStage] = useState<WritingStage>('guided')
  const [blankRep, setBlankRep] = useState(0)

  const currentChar = characters[charIndex]
  const charProgress = `${charIndex + 1} / ${characters.length}`

  const radicalHint = useHint(1)
  const radicals = useMemo(() => {
    try {
      const result = hanzi.decompose(currentChar, 1)
      return (result?.components as string[] | undefined)?.filter(c => c !== currentChar) ?? []
    }
    catch {
      return []
    }
  }, [currentChar])
  const showRadicals = radicals.length > 0

  function handleComplete(usedHint: boolean) {
    if (usedHint)
      anyHintUsedRef.current = true
    setHintAnimating(false)

    if (stage === 'guided') {
      setStage('blank')
      setBlankRep(0)
    }
    else if (blankRep < writingReps - 1) {
      setBlankRep(blankRep + 1)
    }
    else {
      advance()
    }
  }

  function advance() {
    setCharIndex((idx) => {
      const next = idx + 1
      if (next >= characters.length) {
        // Use setTimeout to call onNext outside the setState cycle
        setTimeout(onNext, 0, Math.round((anyHintUsedRef.current ? 80 : 100) * radicalHint.hintScore))
        return idx
      }
      return next
    })
    setStage('guided')
    setBlankRep(0)
  }

  function handleHint() {
    anyHintUsedRef.current = true
    setHintAnimating(true)
    animateCharacter(writerRef, () => setHintAnimating(false))
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {stage === 'blank' && showRadicals && (
        <HintButton
          level={radicalHint.level}
          totalLevels={1}
          exhausted={radicalHint.exhausted}
          onHint={radicalHint.revealNext}
        />
      )}
      {hintAnimating
        ? (
            <Button size="sm" onClick={() => handleComplete(true)}>{t('study.writing.continueButton')}</Button>
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

      {/* Character progress and stage label */}
      <div className="text-center mb-3 space-y-0.5">
        <p className="text-sm text-muted-foreground">
          {stage === 'guided' ? t('study.writing.stageGuided') : t('study.writing.stageBlank')}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {characters.length > 1 && charProgress}
          {stage === 'blank' && writingReps > 1 && ` · ${blankRep + 1} / ${writingReps}`}
        </p>
      </div>

      {/* Radical hint */}
      {stage === 'blank' && showRadicals && radicalHint.level > 0 && (
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
          key={`${entry.id}-${charIndex}-${stage}-${blankRep}`}
          character={currentChar}
          writerRef={writerRef}
          onComplete={handleComplete}
          showOutline={stage === 'guided'}
        />
      </div>
    </ExerciseCard>
  )
}
