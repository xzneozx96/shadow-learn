import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { HintButton } from '@/components/study/exercises/HintButton'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { useI18n } from '@/contexts/I18nContext'
import { useHint } from '@/hooks/useHint'
import { cn } from '@/lib/utils'

interface ClozeQuestion {
  story: string
  blanks: string[]
}

interface Props {
  question: ClozeQuestion
  entries: VocabEntry[]
  caps: LanguageCapabilities
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
}

const BLANK_REGEX = /\{\{([^}]+)\}\}/g
const WHITESPACE_RE = /\s+/g

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

// Each blank registers its hintScore via this callback type
type RegisterHintScore = (blankIndex: number, score: number) => void

interface BlankInputProps {
  blankIndex: number
  blank: string
  entry: VocabEntry | undefined
  checked: boolean
  autoFocus: boolean
  value: string
  onChange: (v: string) => void
  langInputMode: LanguageCapabilities['inputMode']
  onRegisterHintScore: RegisterHintScore
}

function BlankInput({ blankIndex, blank, entry, checked, autoFocus, value, onChange, langInputMode, onRegisterHintScore }: BlankInputProps) {
  const hint = useHint(entry ? 2 : 0)

  useEffect(() => {
    onRegisterHintScore(blankIndex, hint.hintScore)
  }, [blankIndex, hint.hintScore, onRegisterHintScore])

  const romanization = entry?.romanization ?? ''
  const furigana = entry && hint.level > 0
    ? hint.level === 1
      ? romanization.replace(WHITESPACE_RE, '')
      : `${romanization.replace(WHITESPACE_RE, '')} · ${entry.meaning}`
    : null

  return (
    <span className="inline-flex flex-col items-center mx-1 align-bottom">
      <span className={cn('text-xs leading-none mb-0.5 tracking-wide', furigana ? 'text-primary/70' : 'invisible')}>
        {furigana ?? '·'}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <LanguageInput
          langInputMode={langInputMode}
          wrapperClassName="inline-block w-14"
          className={cn(
            'w-14 text-center text-sm border-0 border-b bg-transparent px-1 rounded-none focus-visible:ring-0',
            checked
              ? value.trim() === blank
                ? 'border-emerald-500/50 text-emerald-400'
                : 'border-destructive/50 text-destructive'
              : 'border-foreground/40',
          )}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={checked}
          placeholder="…"
          autoFocus={autoFocus}
        />
        {!checked && entry && (
          <HintButton
            level={hint.level}
            totalLevels={2}
            exhausted={hint.exhausted}
            onHint={hint.revealNext}
            iconOnly
          />
        )}
      </span>
    </span>
  )
}

export function ClozeExercise({ question, entries, caps, progress = '', onNext }: Props) {
  const { t } = useI18n()
  const parts = parseStory(question.story)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const hintScoresRef = useRef<Record<number, number>>({})

  const blankIndices: number[] = []
  parts.forEach((p, i) => {
    if (p.blank)
      blankIndices.push(i)
  })

  function findEntry(blank: string) {
    return entries.find(e => e.word === blank)
  }

  const registerHintScore = useCallback((blankIndex: number, score: number) => {
    hintScoresRef.current[blankIndex] = score
  }, [])

  function handleNext() {
    const today = new Date().toISOString().split('T')[0]
    const mistakes: MistakeExample[] = blankIndices
      .filter(i => answers[i]?.trim() !== parts[i].blank)
      .map(i => ({
        userAnswer: answers[i]?.trim() ?? '',
        correctAnswer: parts[i].blank!,
        date: today,
      }))

    // Score per blank: correct × hintScore × 100, then average
    const blankScores = blankIndices.map((i) => {
      const correct = answers[i]?.trim() === parts[i].blank ? 1 : 0
      const hs = hintScoresRef.current[i] ?? 1
      return correct * hs * 100
    })
    const finalScore = blankScores.length > 0
      ? Math.round(blankScores.reduce((a, b) => a + b, 0) / blankScores.length)
      : 0

    onNext(finalScore, { mistakes: mistakes.length > 0 ? mistakes : undefined })
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 px-[18px] py-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>{t('study.checkButton')}</Button>
        : <Button size="sm" onClick={handleNext}>{t('study.nextButton')}</Button>}
    </div>
  )

  return (
    <ExerciseCard
      type={t('study.mode.cloze')}
      progress={progress}
      footer={footer}
      info={t('study.exercise.cloze.info')}
    >
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-lg leading-[2.4] text-foreground/90 mb-0">
        {parts.map((part, i) => {
          if (!part.blank)
            return <span key={i}>{part.text}</span>
          return (
            <BlankInput
              key={i}
              blankIndex={i}
              blank={part.blank}
              entry={findEntry(part.blank)}
              checked={checked}
              autoFocus={i === blankIndices[0]}
              value={answers[i] ?? ''}
              onChange={v => setAnswers(a => ({ ...a, [i]: v }))}
              langInputMode={caps.inputMode}
              onRegisterHintScore={registerHintScore}
            />
          )
        })}
      </div>

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
              <span className="font-semibold">{correct ? blank : (answers[i]?.trim() || '(empty)')}</span>
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
