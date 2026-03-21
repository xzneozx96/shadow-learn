import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { useI18n } from '@/contexts/I18nContext'
import { charDiff, getActiveChips, scoreReconstruction, shuffleArray } from '@/lib/study-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  words: string[]
  caps: LanguageCapabilities
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
}

export function ReconstructionExercise({ entry, words, caps, progress = '', onNext }: Props) {
  const { t } = useI18n()
  const chips = useMemo(() => shuffleArray(words), [words])
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const active = getActiveChips(chips, value)
  const score = checked ? scoreReconstruction(value, entry.sourceSegmentText) : null
  const correct = score === 100
  const diff = checked ? charDiff(value, entry.sourceSegmentText) : null

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {!checked
        ? <Button size="sm" onClick={() => setChecked(true)}>{t('study.checkButton')}</Button>
        : (
            <Button
              size="sm"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                const mistakes: MistakeExample[] = !correct
                  ? [{ userAnswer: value.trim(), correctAnswer: entry.sourceSegmentText.trim(), date: today }]
                  : []
                onNext(score ?? 0, { mistakes: mistakes.length > 0 ? mistakes : undefined })
              }}
            >
              {t('study.nextButton')}
            </Button>
          )}
    </div>
  )

  return (
    <ExerciseCard
      type={t('study.mode.reconstruction')}
      progress={progress}
      footer={footer}
      info="Rearrange the scrambled word chips into the correct sentence. Tests grammar and word order."
    >
      {/* Source context link */}
      <Link
        to={`/lesson/${entry.sourceLessonId}?segmentId=${entry.sourceSegmentId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border/50 rounded-full px-2.5 py-1 mb-3 hover:text-foreground transition-colors"
      >
        📍
        {' '}
        {entry.sourceLessonTitle}
        {' '}
        {t('study.whereYouSaved')}
        {' '}
        {entry.word}
      </Link>

      <p className="text-sm text-muted-foreground mb-3">{t('study.typeInOrder')}</p>

      {/* Word chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((chip, i) => (

          <span
            key={i} // eslint-disable-line react/no-array-index-key
            className={cn(
              'px-3 py-1.5 rounded-md text-base font-semibold border border-border bg-secondary transition-opacity',
              !active[i] && 'opacity-25',
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Input */}
      <LanguageInput
        langInputMode={caps.inputMode}
        className="text-lg tracking-wide"
        placeholder={t('study.typeTheSentence')}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
        disabled={checked}
      />

      {/* Char diff (post-check) */}
      {diff && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-muted/30 text-lg font-bold tracking-wider">
          {diff.map((d, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className={d.ok ? 'text-emerald-400' : 'text-destructive'}>{d.char}</span>
          ))}
        </div>
      )}
    </ExerciseCard>
  )
}
