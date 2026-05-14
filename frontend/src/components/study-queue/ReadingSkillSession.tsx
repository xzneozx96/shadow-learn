// frontend/src/components/study-queue/ReadingSkillSession.tsx
import type { VocabEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'
import {
  getReadingDraft,
  getReadingPassage,
  markReadingSubmitted,
  setReadingDraft,
  setReadingPassage,
  setReadingPassagePinyin,
} from '@/lib/skillSessionProgress'

type Phase = 'loading' | 'load-error' | 'reading' | 'translating' | 'grading' | 'result'

interface GradeResult {
  score: 'excellent' | 'good' | 'needs-work'
  feedback: string
}

interface Props {
  entries: VocabEntry[]
  date: string
  onComplete: () => void
  onBack: () => void
}

export function ReadingSkillSession({ entries, date, onComplete, onBack }: Props) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('loading')
  const [passage, setPassage] = useState('')
  const [translation, setTranslation] = useState(() => getReadingDraft(date))
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null)

  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'

  useEffect(() => {
    const cachedPassage = getReadingPassage(date)
    if (cachedPassage) {
      setPassage(cachedPassage)
      setPhase('translating')
      return
    }

    const words = entries.map(e => ({
      hanzi: e.word,
      pinyin: e.romanization,
      meaning: e.meaning,
    }))

    void fetch(`${API_BASE}/api/daily-review/passage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words, source_language: sourceLanguage }),
    })
      .then(async (resp) => {
        if (!resp.ok)
          throw new Error('passage generation failed')
        const data = await resp.json() as { passage: string, pinyin: string }
        setReadingPassage(date, data.passage)
        setReadingPassagePinyin(date, data.pinyin)
        setPassage(data.passage)
        setPhase('translating')
      })
      .catch(() => setPhase('load-error'))
  }, [date, entries, sourceLanguage])

  function handleTranslationChange(value: string) {
    setTranslation(value)
    setReadingDraft(date, value)
  }

  async function handleSubmit() {
    setPhase('grading')
    try {
      const resp = await fetch(`${API_BASE}/api/daily-review/grade-passage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passage,
          user_translation: translation,
          source_language: sourceLanguage,
        }),
      })
      if (!resp.ok)
        throw new Error('grading failed')
      const result = await resp.json() as GradeResult
      setGradeResult(result)
      markReadingSubmitted(date)
      setPhase('result')
    }
    catch {
      markReadingSubmitted(date)
      setPhase('result')
      setGradeResult({ score: 'good', feedback: '' })
    }
  }

  const scoreLabelMap: Record<string, string> = {
    'excellent': t('reading.excellent'),
    'good': t('reading.good'),
    'needs-work': t('reading.needsWork'),
  }

  const scoreColorMap: Record<string, string> = {
    'excellent': 'text-emerald-500',
    'good': 'text-blue-500',
    'needs-work': 'text-amber-500',
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.reading')}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {phase === 'loading' && (
          <p className="text-sm text-muted-foreground">{t('reading.generating')}</p>
        )}

        {phase === 'load-error' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">Failed to generate passage.</p>
            <Button variant="outline" onClick={() => setPhase('loading')}>
              {t('reading.retryGenerate')}
            </Button>
          </div>
        )}

        {(phase === 'translating' || phase === 'grading' || phase === 'result') && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {passage}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t('reading.translatePrompt')}</label>
              <textarea
                className="w-full rounded-lg border border-border bg-muted/20 p-3 text-sm focus:outline-none focus:border-primary resize-none"
                rows={5}
                value={translation}
                onChange={e => handleTranslationChange(e.target.value)}
                disabled={phase === 'grading' || phase === 'result'}
              />
            </div>

            {phase === 'translating' && (
              <Button
                onClick={() => void handleSubmit()}
                disabled={!translation.trim()}
              >
                {t('reading.submit')}
              </Button>
            )}

            {phase === 'grading' && (
              <p className="text-sm text-muted-foreground">{t('reading.grading')}</p>
            )}

            {phase === 'result' && gradeResult && (
              <div className="flex flex-col gap-3">
                {gradeResult.score && (
                  <div className={`text-lg font-bold ${scoreColorMap[gradeResult.score] ?? ''}`}>
                    {scoreLabelMap[gradeResult.score] ?? gradeResult.score}
                  </div>
                )}
                {gradeResult.feedback && (
                  <p className="text-sm">{gradeResult.feedback}</p>
                )}
                <Button onClick={onComplete}>
                  {t('vocab.makeASentence.continue')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
