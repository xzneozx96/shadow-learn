import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { comparePinyin } from '@/lib/pinyin-utils'
import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
}

export function PinyinRecallExercise({ entry, onNext, playTTS }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = comparePinyin(value, entry.pinyin)

  function handleCheck() {
    if (!value.trim()) return
    setChecked(true)
    if (correct) void playTTS(entry.word)
  }

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-6">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
        🔤 Pinyin Recall
      </span>

      <div className="text-center py-5 pb-4">
        <span className="text-5xl font-bold tracking-widest">{entry.word}</span>
        <p className="text-xs text-muted-foreground mt-2.5">{entry.meaning}</p>
      </div>

      <Input
        className="text-center text-sm mb-2"
        placeholder="Type pinyin with tones, e.g. jīntiān or jin1tian1…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[10px] text-muted-foreground/50 text-center mb-4">Accepts tone marks or tone numbers</p>

      {checked && (
        <div className={cn(
          'rounded-[var(--radius)] border px-4 py-3 mb-4 text-sm',
          correct
            ? 'bg-green-500/10 border-green-500/25 text-green-400'
            : 'bg-red-500/10 border-red-500/25 text-red-400',
        )}>
          {correct ? '✓ Correct!' : `✗ Incorrect — ${entry.pinyin}`}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
          Skip
        </button>
        {!checked
          ? <Button size="sm" onClick={handleCheck}>Check →</Button>
          : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>
        }
      </div>
    </div>
  )
}
