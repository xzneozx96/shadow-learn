import type { VocabEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

interface Result { entry: VocabEntry, correct: boolean }

interface Props {
  results: Result[]
  onStudyAgain: () => void
  onBack: () => void
}

export function SessionSummary({ results, onStudyAgain, onBack }: Props) {
  const { t } = useI18n()
  const correctCount = results.filter(r => r.correct).length
  const wrong = results.filter(r => !r.correct).map(r => r.entry)

  return (
    <div className="rounded-md border border-border bg-card backdrop-blur-xl p-8 text-center">
      <div className="text-4xl mb-2">{correctCount === results.length ? '🎉' : '💪'}</div>
      <div className="text-4xl font-bold tracking-tight">
        {correctCount}
        {' '}
        /
        {' '}
        {results.length}
      </div>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        {correctCount === results.length ? t('study.perfectSession') : `${wrong.length} ${t('study.wordsToRevisit')}`}
      </p>

      {wrong.length > 0 && (
        <div className="rounded-md border border-red-500/20 bg-red-500/8 px-4 py-3 mb-6 text-left">
          <p className="text-sm font-semibold tracking-widest text-red-400 uppercase mb-2">{t('study.reviewThese')}</p>
          {wrong.map(e => (
            <div key={wrong.indexOf(e)} className="flex items-center gap-3 mb-1">
              <span className="text-lg font-bold text-red-300">{e.word}</span>
              <div>
                <div className="text-sm text-foreground">
                  {e.romanization}
                  {' '}
                  ·
                  {' '}
                  {e.meaning}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>{t('study.backToWorkbook')}</Button>
        <Button className="flex-1" onClick={onStudyAgain}>{t('study.studyAgain')}</Button>
      </div>
    </div>
  )
}
