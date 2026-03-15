import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function DictationExercise({ entry, onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const [pinyinMode, setPinyinMode] = useState(false)
  const expected = pinyinMode ? entry.pinyin : entry.sourceSegmentChinese
  const correct = value.trim() === expected.trim()

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-6">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
        🎧 Dictation
      </span>

      <p className="text-xs text-muted-foreground mb-5">Listen carefully and type what you hear in Chinese.</p>

      <button
        className="flex flex-col items-center gap-1.5 mx-auto mb-5 size-16 rounded-full border border-border bg-secondary/60 hover:bg-accent transition-colors justify-center text-2xl"
        onClick={() => void playTTS(entry.sourceSegmentChinese)}
      >
        🔊
      </button>

      <Input
        className="mb-3"
        placeholder={pinyinMode ? 'Type pinyin…' : 'Type what you heard…'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {checked && (
        <div className={cn(
          'rounded-[var(--radius)] border px-4 py-3 mb-4 text-sm',
          correct
            ? 'bg-green-500/10 border-green-500/25 text-green-400'
            : 'bg-red-500/10 border-red-500/25 text-red-400',
        )}>
          {correct ? '✓ Correct!' : `✗ — ${expected}`}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
            Skip
          </button>
          <button
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground px-2 py-1 border border-border/40 rounded"
            onClick={() => setPinyinMode(m => !m)}
          >
            {pinyinMode ? 'Switch to characters' : 'Switch to pinyin'}
          </button>
        </div>
        {!checked
          ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
          : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>
        }
      </div>
    </div>
  )
}
