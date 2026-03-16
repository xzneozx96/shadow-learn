import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { comparePinyin } from '@/lib/pinyin-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function PinyinRecallExercise({ entry, progress = '', onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = comparePinyin(value, entry.pinyin)

  function handleCheck() {
    if (!value.trim())
      return
    setChecked(true)
    if (correct)
      void playTTS(entry.word)
  }

  const footer = (
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={handleCheck}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard
      type="Pinyin Recall"
      progress={progress}
      footer={footer}
      info="See the characters and type their pinyin with tone marks. Tests pronunciation knowledge without speaking aloud."
    >
      {/* Word display */}
      <div className="text-center py-2 pb-5">
        <div className="text-[52px] font-extrabold tracking-widest leading-none text-foreground">
          {entry.word}
        </div>
        <p className="text-sm text-muted-foreground mt-3">{entry.meaning}</p>
      </div>

      {/* Input */}
      <Input
        className="text-center"
        placeholder="Type pinyin with tones, e.g. jīntiān or jin1tian1…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[11px] text-muted-foreground/50 text-center mt-1.5">
        Accepts tone marks or tone numbers
      </p>

      {/* Feedback */}
      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-3 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}
        >
          {correct ? '✓ Correct!' : `✗ Incorrect — ${entry.pinyin}`}
        </div>
      )}
    </ExerciseCard>
  )
}
