import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { computeAccuracyScore, computePinyinDiff } from '@/lib/diff-utils'
import { compareRomanization } from '@/lib/romanization-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
  playTTS: (text: string) => Promise<void>
  caps: LanguageCapabilities
}

export function RomanizationRecallExercise({ entry, progress = '', onNext, playTTS, caps }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = compareRomanization(value, entry.romanization, caps.romanizationSystem)
  const diff = checked ? computePinyinDiff(value.trim(), entry.romanization?.trim() ?? '') : []
  const accuracyScore = checked ? computeAccuracyScore(diff) : 0

  function handleCheck() {
    if (!value.trim())
      return
    setChecked(true)
    if (correct)
      void playTTS(entry.word)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={handleCheck}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(accuracyScore)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard
      type={`${caps.romanizationLabel} Recall`}
      progress={progress}
      footer={footer}
      info={`See the word and type its ${caps.romanizationLabel}. Tests pronunciation knowledge without speaking aloud.`}
    >
      <div className="text-center py-2 pb-5">
        <div className="text-[52px] font-extrabold tracking-widest leading-none text-foreground">
          {entry.word}
        </div>
        <p className="text-sm text-muted-foreground mt-3">{entry.meaning}</p>
      </div>

      <Input
        className="text-center"
        placeholder={caps.romanizationPlaceholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[11px] text-muted-foreground/50 text-center mt-1.5">
        {caps.romanizationSystem === 'pinyin' ? 'Accepts tone marks or tone numbers' : `Type ${caps.romanizationLabel}`}
      </p>

      {checked && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Your answer</p>
            <div className="flex flex-wrap gap-2">
              {diff.map((tok, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-base font-semibold px-2 py-0.5 rounded-md',
                    tok.correct
                      ? 'text-emerald-500 bg-emerald-500/10'
                      : 'text-destructive bg-destructive/10',
                  )}
                >
                  {tok.text || '□'}
                </span>
              ))}
            </div>
          </div>
          <p className={cn('text-sm font-bold', accuracyScore === 100 ? 'text-emerald-400' : 'text-amber-400')}>
            {accuracyScore}
            % accurate
          </p>
          {accuracyScore < 100 && entry.romanization && (
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Correct answer</p>
              <p className="text-xl font-medium">{entry.romanization}</p>
            </div>
          )}
        </div>
      )}
    </ExerciseCard>
  )
}
