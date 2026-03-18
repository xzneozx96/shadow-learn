import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { Loader2, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  caps: LanguageCapabilities
}

export function DictationExercise({ entry, progress = '', onNext, playTTS, loadingText, caps }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const expected = entry.sourceSegmentText
  const correct = value.trim() === expected.trim()

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
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
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-3 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}
        >
          {correct ? '✓ Correct!' : `✗ Incorrect — ${expected}`}
        </div>
      )}
    </ExerciseCard>
  )
}
