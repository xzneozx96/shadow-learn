import type { MistakeExample } from '@/db'
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { ChineseInput } from '@/components/ui/ChineseInput'
import { cn } from '@/lib/utils'

interface ClozeQuestion {
  story: string // "小明说{{今天}}他要去..."
  blanks: string[]
}

interface Props {
  question: ClozeQuestion
  entries: VocabEntry[]
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
}

const BLANK_REGEX = /\{\{([^}]+)\}\}/g

function parseStory(story: string): { text: string, blank: string | null }[] {
  const parts: { text: string, blank: string | null }[] = []
  let last = 0
  const matches = [...story.matchAll(BLANK_REGEX)]
  for (const m of matches) {
    if (m.index !== undefined && m.index > last)
      parts.push({ text: story.slice(last, m.index), blank: null })
    parts.push({ text: '', blank: m[1] })
    if (m.index !== undefined)
      last = m.index + m[0].length
  }
  if (last < story.length)
    parts.push({ text: story.slice(last), blank: null })
  return parts
}

export function ClozeExercise({ question, entries, progress = '', onNext }: Props) {
  const parts = parseStory(question.story)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)

  const blankIndices: number[] = []
  parts.forEach((p, i) => {
    if (p.blank)
      blankIndices.push(i)
  })

  const allCorrect = blankIndices.every(i => answers[i]?.trim() === parts[i].blank)

  function findEntry(blank: string) {
    return entries.find(e => e.word === blank)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(allCorrect ? 100 : 0)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard
      type="Scenario Cloze"
      progress={progress}
      footer={footer}
      info="Read a short story and fill in the missing vocabulary words from context. Tests contextual understanding."
    >
      {/* Story with inline inputs */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm leading-[2.4] text-foreground/90 mb-0">
        {parts.map((part, i) => {
          if (!part.blank)
            return <span key={i}>{part.text}</span>
          const correct = answers[i]?.trim() === part.blank
          return (
            <ChineseInput
              key={i}
              wrapperClassName="inline-block w-14 mx-1"
              className={cn(
                'w-14 text-center text-sm border-0 border-b bg-transparent px-1 rounded-none focus-visible:ring-0',
                checked
                  ? correct
                    ? 'border-emerald-500/50 text-emerald-400'
                    : 'border-destructive/50 text-destructive'
                  : 'border-foreground/40',
              )}
              value={answers[i] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
              disabled={checked}
              placeholder="…"
              autoFocus={i === blankIndices[0]}
            />
          )
        })}
      </div>

      {/* Per-blank feedback (post-check) */}
      {checked && blankIndices.map((i) => {
        const blank = parts[i].blank!
        const entry = findEntry(blank)
        const correct = answers[i]?.trim() === blank
        return (
          <div
            key={i}
            className={cn(
              'mt-3 rounded-lg border px-4 py-3 text-sm flex items-start gap-2.5',
              correct
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                : 'border-destructive/25 bg-destructive/10 text-destructive',
            )}
          >
            <span className="shrink-0">{correct ? '✓' : '✗'}</span>
            <div>
              <span className="font-semibold">{blank}</span>
              {' — '}
              {correct ? 'correct!' : `expected "${blank}"`}
              {entry && (
                <Link
                  to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
                  className="block text-sm mt-0.5 opacity-60 hover:opacity-100"
                >
                  📍 View in video →
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </ExerciseCard>
  )
}
