import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

/** Returns true if chip should remain visible (not yet typed) */
export function getActiveChips(chips: string[], typed: string): boolean[] {
  return chips.map(chip => !typed.includes(chip))
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function charDiff(typed: string, expected: string): { char: string; ok: boolean }[] {
  return expected.split('').map((ch, i) => ({ char: ch, ok: typed[i] === ch }))
}

interface Props {
  entry: VocabEntry
  words: string[]
  onNext: (correct: boolean) => void
}

export function ReconstructionExercise({ entry, words, onNext }: Props) {
  const chips = useMemo(() => shuffleArray(words), [words])
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const active = getActiveChips(chips, value)
  const correct = value.trim() === entry.sourceSegmentChinese.trim()
  const diff = checked ? charDiff(value, entry.sourceSegmentChinese) : null

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-6">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-4">
        🔀 Sentence Reconstruction
      </span>

      <Link
        to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-4 hover:text-foreground transition-colors"
      >
        📍 {entry.sourceLessonTitle} — where you saved {entry.word}
      </Link>

      <p className="text-xs text-muted-foreground mb-4">Type the words in correct order.</p>

      {/* Chip hints */}
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={cn(
              'px-3 py-1.5 rounded-[var(--radius)] text-base font-semibold border border-border bg-secondary/60 transition-opacity',
              !active[i] && 'opacity-25 pointer-events-none',
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      <Input
        className="text-base tracking-wide mb-0"
        placeholder="Type the sentence…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {diff && (
        <div className="mt-3 px-3 py-2 rounded-[var(--radius)] bg-secondary/40 text-lg font-bold tracking-wider">
          {diff.map((d, i) => (
            <span key={i} className={d.ok ? 'text-green-400' : 'text-red-400'}>{d.char}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
          Skip
        </button>
        {!checked
          ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
          : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>
        }
      </div>
    </div>
  )
}
