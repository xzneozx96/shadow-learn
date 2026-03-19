import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { computeAccuracyScore, computeCharDiff } from '@/lib/diff-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  caps: LanguageCapabilities
}

export function DictationExercise({ entry, progress = '', onNext, playTTS, loadingText, caps }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const expected = entry.sourceSegmentText
  const diff = checked ? computeCharDiff(value.trim(), expected.trim()) : []
  const accuracyScore = checked ? computeAccuracyScore(diff) : 0

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : (
            <Button
              size="sm"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                const mistakes: MistakeExample[] = accuracyScore < 100
                  ? [{ userAnswer: value.trim(), correctAnswer: expected.trim(), date: today }]
                  : []
                onNext(accuracyScore, { mistakes: mistakes.length > 0 ? mistakes : undefined })
              }}
            >
              Next →
            </Button>
          )}
    </div>
  )

  return (
    <ExerciseCard
      type="Dictation"
      progress={progress}
      footer={footer}
      info="Listen to the audio clip and type the Chinese sentence you hear. Tests listening comprehension and character recall."
    >
      <p className="text-sm text-muted-foreground mb-4">
        Listen carefully and type what you hear in Chinese.
      </p>

      {(() => {
        const isLoading = loadingText === entry.sourceSegmentText
        return (
          <button
            type="button"
            aria-label="Play audio"
            disabled={isLoading}
            className="flex items-center justify-center mx-auto mb-5 size-14 rounded-full border border-border bg-secondary hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => void playTTS(entry.sourceSegmentText)}
          >
            {isLoading
              ? <Loader2 className="size-5 text-muted-foreground animate-spin" />
              : <Volume2 className="size-5 text-muted-foreground" />}
          </button>
        )
      })()}

      <LanguageInput
        langInputMode={caps.inputMode}
        placeholder={caps.dictationPlaceholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {checked && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Your answer</p>
            <div className="flex flex-wrap gap-1">
              {diff.map((tok, i) => (
                <span
                  key={`${i}-${tok.text}`}
                  className={cn(
                    'text-xl font-semibold px-1.5 py-0.5 rounded-md',
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
          {accuracyScore < 100 && (
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Correct answer</p>
              <p className="text-xl font-medium">{expected}</p>
            </div>
          )}
        </div>
      )}
    </ExerciseCard>
  )
}
