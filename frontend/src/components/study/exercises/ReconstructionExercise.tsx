import type { VocabEntry } from '@/types'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { charDiff, getActiveChips, shuffleArray } from '@/lib/study-utils'
import { cn } from '@/lib/utils'

export { getActiveChips }

interface Props {
  entry: VocabEntry
  words: string[]
  progress?: string
  onNext: (correct: boolean) => void
}

export function ReconstructionExercise({ entry, words, progress = '', onNext }: Props) {
  const chips = useMemo(() => shuffleArray(words), [words])
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const active = getActiveChips(chips, value)
  const correct = value.trim() === entry.sourceSegmentChinese.trim()
  const diff = checked ? charDiff(value, entry.sourceSegmentChinese) : null

  const footer = (
    <div className="flex items-center justify-between px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard type="Sentence Reconstruction" progress={progress} footer={footer}>
      {/* Source context link */}
      <Link
        to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-3 hover:text-foreground transition-colors"
      >
        📍 {entry.sourceLessonTitle} — where you saved {entry.word}
      </Link>

      <p className="text-xs text-muted-foreground mb-3">Type the words in correct order.</p>

      {/* Word chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-semibold border border-border bg-secondary transition-opacity',
              !active[i] && 'opacity-25',
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Input */}
      <Input
        className="text-base tracking-wide"
        placeholder="Type the sentence…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {/* Char diff (post-check) */}
      {diff && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-muted/30 text-lg font-bold tracking-wider">
          {diff.map((d, i) => (
            <span key={i} className={d.ok ? 'text-emerald-400' : 'text-destructive'}>{d.char}</span>
          ))}
        </div>
      )}
    </ExerciseCard>
  )
}
