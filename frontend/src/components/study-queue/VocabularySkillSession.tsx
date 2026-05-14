import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { FlashcardExercise } from '@/components/study/exercises/FlashcardExercise'
import { RomanizationRecallExercise } from '@/components/study/exercises/RomanizationRecallExercise'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTracking } from '@/hooks/useTracking'
import { useTTS } from '@/hooks/useTTS'
import { API_BASE } from '@/lib/config'
import { getLanguageCaps } from '@/lib/language-caps'
import { getSkillProgress, markWordComplete } from '@/lib/skillSessionProgress'

type ExerciseStep = 'flashcard' | 'romanization' | 'make-a-sentence'

interface SentenceGradeResult {
  correct: boolean
  feedback: string
}

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onBack: () => void
}

export function VocabularySkillSession({ entries, date, onComplete, onBack }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const completedIds = new Set(getSkillProgress('vocabulary', date))
  const remaining = entries.filter(e => !completedIds.has(e.id))
  const [step, setStep] = useState<ExerciseStep>('flashcard')

  const [sentenceInput, setSentenceInput] = useState('')
  const [sentenceResult, setSentenceResult] = useState<SentenceGradeResult | null>(null)
  const [sentenceGrading, setSentenceGrading] = useState(false)
  const [sentenceError, setSentenceError] = useState(false)

  const total = entries.length
  const completedCount = completedIds.size

  if (remaining.length === 0) {
    onComplete()
    return null
  }

  const current = remaining[0]
  const progress = `${completedCount + 1} / ${total}`

  function advanceWord() {
    markWordComplete('vocabulary', date, current.id)
    setSentenceInput('')
    setSentenceResult(null)
    setSentenceError(false)
    setStep('flashcard')
  }

  function handleFlashcardNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'flashcard', score })
    setStep('romanization')
  }

  function handleRomanizationNext(score: number) {
    void logExerciseResult({ vocabEntry: current, exerciseType: 'romanization-recall', score })
    setStep('make-a-sentence')
  }

  async function handleSentenceSubmit() {
    const sentence = sentenceInput.trim()
    if (!sentence)
      return
    setSentenceGrading(true)
    setSentenceError(false)
    try {
      if (!keys)
        return
      const resp = await fetch(`${API_BASE}/api/daily-review/grade-sentence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hanzi: current.word,
          meaning: current.meaning,
          openrouter_api_key: keys.openrouterApiKey,
          user_sentence: sentence,
        }),
      })
      if (!resp.ok)
        throw new Error('grade-sentence failed')
      const result = await resp.json() as SentenceGradeResult
      setSentenceResult(result)
    }
    catch {
      setSentenceError(true)
    }
    finally {
      setSentenceGrading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.vocabulary')}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {step === 'flashcard' && (
          <FlashcardExercise
            entry={current}
            progress={progress}
            onNext={handleFlashcardNext}
          />
        )}
        {step === 'romanization' && (
          <RomanizationRecallExercise
            entry={current}
            progress={progress}
            onNext={handleRomanizationNext}
            playTTS={playTTS}
            caps={caps}
          />
        )}
        {step === 'make-a-sentence' && (
          <div className="flex flex-col gap-4">
            <div className="text-2xl font-bold">{current.word}</div>
            <div className="text-sm text-muted-foreground">{current.meaning}</div>
            <p className="text-sm">{t('vocab.makeASentence.prompt')}</p>
            <textarea
              className="w-full rounded-lg border border-border bg-muted/20 p-3 text-sm focus:outline-none focus:border-primary resize-none"
              rows={3}
              value={sentenceInput}
              onChange={e => setSentenceInput(e.target.value)}
              disabled={!!sentenceResult || sentenceGrading}
            />
            {!sentenceResult && !sentenceError && (
              <Button
                onClick={() => void handleSentenceSubmit()}
                disabled={sentenceGrading || !sentenceInput.trim()}
              >
                {sentenceGrading ? t('vocab.makeASentence.grading') : t('vocab.makeASentence.submit')}
              </Button>
            )}
            {sentenceError && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{t('vocab.makeASentence.gradingFailed')}</p>
                <Button onClick={advanceWord}>{t('vocab.makeASentence.continue')}</Button>
              </div>
            )}
            {sentenceResult && (
              <div className="flex flex-col gap-3">
                <div className={sentenceResult.correct ? 'text-emerald-500 font-semibold' : 'text-destructive font-semibold'}>
                  {sentenceResult.correct ? '✓' : '✗'}
                </div>
                <p className="text-sm">{sentenceResult.feedback}</p>
                <Button onClick={advanceWord}>{t('vocab.makeASentence.continue')}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
