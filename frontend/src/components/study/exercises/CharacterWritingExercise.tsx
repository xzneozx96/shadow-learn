import type HanziWriter from 'hanzi-writer'
import type { VocabEntry } from '@/types'
import type { LanguageCapabilities } from '@/lib/language-caps'
import { useRef, useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { animateCharacter } from './hanzi-writer-utils'
import { HanziWriterCanvas } from './HanziWriterCanvas'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  caps: LanguageCapabilities
}

export function CharacterWritingExercise({ entry, progress = '', onNext, caps }: Props) {
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
        setTimeout(onNext, 0, !anyHintUsedRef.current)
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
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {hintAnimating
        ? (
            <Button size="sm" onClick={advance}>Continue →</Button>
          )
        : (
            <Button variant="outline" size="sm" onClick={handleHint}>Hint</Button>
          )}
    </div>
  )

  return (
    <ExerciseCard
      type="Character Writing"
      progress={progress}
      footer={footer}
      info="Trace each stroke of the character in the correct order. Builds handwriting muscle memory."
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
