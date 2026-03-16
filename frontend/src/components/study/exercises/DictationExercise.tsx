import type { VocabEntry } from '@/types'
import { Volume2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function DictationExercise({ entry, progress = '', onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const [pinyinMode, setPinyinMode] = useState(false)
  const expected = pinyinMode ? entry.pinyin : entry.sourceSegmentChinese
  const correct = value.trim() === expected.trim()

  const footer = (
    <div className="flex items-center justify-between px-[18px] py-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
        <Button variant="ghost" size="sm" onClick={() => setPinyinMode(m => !m)}>
          {pinyinMode ? 'Characters' : 'Pinyin mode'}
        </Button>
      </div>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Dictation" progress={progress} footer={footer}>
      <p className="text-xs text-muted-foreground mb-4">
        Listen carefully and type what you hear in Chinese.
      </p>

      {/* TTS play button */}
      <button
        type="button"
        aria-label="Play audio"
        className="flex items-center justify-center mx-auto mb-5 size-14 rounded-full border border-border bg-secondary hover:bg-accent transition-colors"
        onClick={() => void playTTS(entry.sourceSegmentChinese)}
      >
        <Volume2 className="size-5 text-muted-foreground" />
      </button>

      {/* Input */}
      <Input
        placeholder={pinyinMode ? 'Type pinyin…' : 'Type what you heard…'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {/* Feedback */}
      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-2.5 text-sm',
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
