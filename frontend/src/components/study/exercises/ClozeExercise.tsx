import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import type { VocabEntry } from '@/types'
import { cn } from '@/lib/utils'

interface ClozeQuestion {
  story: string    // "小明说{{今天}}他要去..."
  blanks: string[] // ["今天", "非常"]
}

interface Props {
  question: ClozeQuestion
  entries: VocabEntry[]
  onNext: (correct: boolean) => void
}

// Parse story into parts: [{text: "小明说", blank: null}, {text: "", blank: "今天"}, ...]
function parseStory(story: string): { text: string; blank: string | null }[] {
  const parts: { text: string; blank: string | null }[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let last = 0
  let m
  while ((m = regex.exec(story)) !== null) {
    if (m.index > last) parts.push({ text: story.slice(last, m.index), blank: null })
    parts.push({ text: '', blank: m[1] })
    last = m.index + m[0].length
  }
  if (last < story.length) parts.push({ text: story.slice(last), blank: null })
  return parts
}

export function ClozeExercise({ question, entries, onNext }: Props) {
  const parts = parseStory(question.story)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstInputRef.current?.focus() }, [])

  let blankIdx = 0
  const blankIndices: number[] = []
  parts.forEach((p, i) => { if (p.blank) blankIndices.push(i) })

  const allCorrect = blankIndices.every(i => answers[i]?.trim() === parts[i].blank)

  function findEntry(blank: string) {
    return entries.find(e => e.word === blank)
  }

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-6">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase border border-border rounded-full px-2.5 py-1 mb-5">
        ✍️ Scenario Cloze · AI Generated
      </span>

      {/* Story with inline inputs */}
      <div className="text-base leading-[2.2] bg-secondary/40 border border-border rounded-[var(--radius)] px-5 py-4 mb-4">
        {parts.map((part, i) => {
          if (!part.blank) return <span key={i}>{part.text}</span>
          const idx = blankIdx++
          const correct = answers[i]?.trim() === part.blank
          return (
            <input
              key={i}
              ref={idx === 0 ? firstInputRef : undefined}
              className={cn(
                'inline-block w-16 text-center text-sm border rounded px-1 py-0.5 mx-0.5 outline-none transition-colors bg-card',
                checked
                  ? correct
                    ? 'border-green-500/50 text-green-400 bg-green-500/8'
                    : 'border-red-500/50 text-red-400 bg-red-500/8'
                  : 'border-border focus:border-foreground/30',
              )}
              value={answers[i] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
              disabled={checked}
              placeholder="…"
            />
          )
        })}
      </div>

      {/* Feedback per blank */}
      {checked && blankIndices.map(i => {
        const blank = parts[i].blank!
        const entry = findEntry(blank)
        const correct = answers[i]?.trim() === blank
        return (
          <div key={i} className={cn(
            'rounded-[var(--radius)] border px-4 py-2.5 mb-2 text-sm flex items-start gap-3',
            correct
              ? 'bg-green-500/8 border-green-500/20 text-green-400'
              : 'bg-red-500/8 border-red-500/20 text-red-400',
          )}>
            <span>{correct ? '✓' : '✗'}</span>
            <div>
              <span className="font-semibold">{blank}</span> — {correct ? 'correct!' : `expected "${blank}"`}
              {entry && (
                <Link
                  to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
                  className="block text-xs mt-0.5 opacity-60 hover:opacity-100"
                >
                  📍 View in video →
                </Link>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between mt-4">
        <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => onNext(false)}>
          Skip
        </button>
        {!checked
          ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
          : <Button size="sm" onClick={() => onNext(allCorrect)}>Next →</Button>
        }
      </div>
    </div>
  )
}
