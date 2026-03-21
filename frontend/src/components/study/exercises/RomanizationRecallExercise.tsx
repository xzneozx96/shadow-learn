import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/contexts/I18nContext'
import { computeAccuracyScore, computePinyinDiff } from '@/lib/diff-utils'
import { compareRomanization } from '@/lib/romanization-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
  playTTS: (text: string) => Promise<void>
  caps: LanguageCapabilities
}

export function RomanizationRecallExercise({ entry, progress = '', onNext, playTTS, caps }: Props) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = compareRomanization(value, entry.romanization, caps.romanizationSystem)
  const diff = checked ? computePinyinDiff(value.trim(), entry.romanization?.trim() ?? '') : []
  const accuracyScore = checked ? computeAccuracyScore(diff) : 0

  function handleCheck() {
    if (!value.trim())
      return
    setChecked(true)
    if (correct)
      void playTTS(entry.word)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
      {!checked
        ? <Button size="sm" onClick={handleCheck}>{t('study.checkButton')}</Button>
        : (
            <Button
              size="sm"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                const mistakes: MistakeExample[] = accuracyScore < 100
                  ? [{ userAnswer: value.trim(), correctAnswer: entry.romanization?.trim() ?? '', date: today }]
                  : []
                onNext(accuracyScore, { mistakes: mistakes.length > 0 ? mistakes : undefined })
              }}
            >
              {t('study.nextButton')}
            </Button>
          )}
    </div>
  )

  return (
    <ExerciseCard
      type={t('study.exercise.romanizationRecall.type').replace('{romanization}', caps.romanizationLabel)}
      progress={progress}
      footer={footer}
      info={t('study.exercise.romanizationRecall.info').replace('{romanization}', caps.romanizationLabel)}
    >
      <div className="text-center py-2 pb-5">
        <div className="text-[52px] font-extrabold tracking-widest leading-none text-foreground">
          {entry.word}
        </div>
        <p className="text-sm text-muted-foreground mt-3">{entry.meaning}</p>
      </div>

      <Input
        className="text-center"
        placeholder={caps.romanizationPlaceholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[11px] text-muted-foreground/50 text-center mt-1.5">
        {caps.romanizationSystem === 'pinyin' ? t('study.acceptsToneMarks') : t('study.typeRomanization').replace('{romanization}', caps.romanizationLabel)}
      </p>

      {checked && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">{t('study.yourAnswer')}</p>
            <div className="flex flex-wrap gap-2">
              {diff.map((tok, i) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className={cn(
                    'text-base font-semibold px-2 py-0.5 rounded-md',
                    tok.correct
                      ? 'text-emerald-500 bg-emerald-500/10'
                      : 'text-destructive bg-destructive/10',
                  )}
                >
                  {tok.text || '□'}
                </span>
              ))}
            </div>
          </div>
          <p className={cn('text-sm font-bold', accuracyScore === 100 ? 'text-emerald-400' : 'text-amber-400')}>
            {accuracyScore}
            {t('study.accurate')}
          </p>
          {accuracyScore < 100 && entry.romanization && (
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">{t('study.correctAnswer')}</p>
              <p className="text-xl font-medium">{entry.romanization}</p>
            </div>
          )}
        </div>
      )}
    </ExerciseCard>
  )
}
