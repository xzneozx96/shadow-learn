import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
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
import { cn } from '@/lib/utils'

type ExerciseStep = 'flashcard' | 'romanization' | 'make-a-sentence'

interface SentenceGradeResult {
  correct: boolean
  feedback: string
}

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onProgress?: () => void
  onBack: () => void
  embedded?: boolean
}

export function VocabularySkillSession({ entries, date, onComplete, onProgress, onBack, embedded }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const { logExerciseResult } = useTracking()
  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
  const { playTTS } = useTTS(db, keys, sourceLanguage)
  const caps = getLanguageCaps(sourceLanguage)

  const entryIds = new Set(entries.map(e => e.id))
  const completedIds = new Set(getSkillProgress('vocabulary', date).filter(id => entryIds.has(id)))
  const remaining = entries.filter(e => !completedIds.has(e.id))
  const [step, setStep] = useState<ExerciseStep>('flashcard')

  const [sentenceInput, setSentenceInput] = useState('')
  const [sentenceResult, setSentenceResult] = useState<SentenceGradeResult | null>(null)
  const [sentenceGrading, setSentenceGrading] = useState(false)
  const [sentenceError, setSentenceError] = useState(false)

  const total = entries.length
  const completedCount = completedIds.size

  useEffect(() => {
    if (remaining.length === 0)
      onComplete()
  }, [remaining.length, onComplete])

  if (remaining.length === 0)
    return null

  const current = remaining[0]
  const progress = `${completedCount + 1} / ${total}`

  function advanceWord() {
    markWordComplete('vocabulary', date, current.id)
    onProgress?.()
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

  const content = (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${current.id}-${step}`}
        className="flex-1 overflow-y-auto p-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
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
          <div className="flex flex-col gap-8">
            <div>
              <h3 className="text-2xl font-bold">{current.word}</h3>
              <p className="text-sm text-muted-foreground">{current.meaning}</p>
            </div>
            <div>
              <p className="text-sm mb-2">{t('vocab.makeASentence.prompt')}</p>
              <textarea
                className="w-full rounded-lg border border-border bg-input/50 p-3 text-base focus:outline-none focus:border-primary resize-none"
                rows={3}
                value={sentenceInput}
                onChange={e => setSentenceInput(e.target.value)}
                disabled={!!sentenceResult || sentenceGrading}
              />
            </div>
            {!sentenceResult && !sentenceError && (
              <Button
                size="lg"
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
              <div className="flex flex-col gap-4">
                <div className={cn(
                  'rounded-xl border px-4 py-3 flex gap-3 items-start',
                  sentenceResult.correct
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'bg-destructive/8 border-destructive/20',
                )}
                >
                  <span className={cn(
                    'text-lg leading-none mt-0.5 shrink-0',
                    sentenceResult.correct ? 'text-emerald-400' : 'text-destructive',
                  )}
                  >
                    {sentenceResult.correct ? '✓' : '✗'}
                  </span>
                  <p className="text-sm leading-relaxed">{sentenceResult.feedback}</p>
                </div>
                <Button onClick={advanceWord} size="lg" className="w-full">{t('vocab.makeASentence.continue')}</Button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )

  if (embedded)
    return content

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.vocabulary')}</span>
      </div>
      {content}
    </div>
  )
}
