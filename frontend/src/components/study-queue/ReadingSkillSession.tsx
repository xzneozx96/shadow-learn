// frontend/src/components/study-queue/ReadingSkillSession.tsx
import type { VocabEntry } from '@/types'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
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
import { cn } from '@/lib/utils'

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
  embedded?: boolean
}

export function ReadingSkillSession({ entries, date, onComplete, onBack, embedded }: Props) {
  const { keys } = useAuth()
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('loading')
  const [passage, setPassage] = useState('')
  const [translation, setTranslation] = useState(() => getReadingDraft(date))
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null)
  const [regenKey, setRegenKey] = useState(0)

  const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'

  function handleRegenerate() {
    setReadingPassage(date, '')
    setPassage('')
    setPhase('loading')
    setRegenKey(k => k + 1)
  }

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

    if (!keys)
      return

    void fetch(`${API_BASE}/api/daily-review/passage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words, openrouter_api_key: keys.openrouterApiKey, source_language: sourceLanguage }),
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
  }, [date, entries, keys, sourceLanguage, regenKey])

  function handleTranslationChange(value: string) {
    setTranslation(value)
    setReadingDraft(date, value)
  }

  async function handleSubmit() {
    setPhase('grading')
    try {
      if (!keys)
        return
      const resp = await fetch(`${API_BASE}/api/daily-review/grade-passage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: keys.openrouterApiKey,
          passage,
          source_language: sourceLanguage,
          user_translation: translation,
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

  const content = (
    <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-6">
      {phase === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('reading.generating')}
        </div>
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
          <div className="rounded-lg border border-border bg-muted p-4 text-lg leading-relaxed whitespace-pre-wrap">
            {passage}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t('reading.translatePrompt')}</label>
            <div className="relative">
              <textarea
                className="w-full rounded-lg border border-border bg-input/50 p-3 text-base focus:outline-none focus:border-primary resize-none"
                rows={5}
                value={translation}
                onChange={e => handleTranslationChange(e.target.value)}
                disabled={phase === 'grading' || phase === 'result'}
              />
              {phase === 'grading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-input/95">
                  <div className="relative flex size-10 items-center justify-center">
                    <Sparkles className="size-6 text-primary animate-pulse" />
                    <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
                  </div>
                  <span className="text-sm font-medium text-foreground/80">{t('reading.grading')}</span>
                </div>
              )}
            </div>
          </div>

          {phase === 'translating' && (
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" size="lg" onClick={onComplete}>{t('reading.skip')}</Button>
              <Button variant="outline" size="lg" onClick={handleRegenerate}>{t('reading.regenerate')}</Button>
              <Button
                size="lg"
                onClick={() => void handleSubmit()}
                disabled={!translation.trim()}
              >
                {t('reading.submit')}
              </Button>
            </div>
          )}

          {phase === 'result' && (
            <div className="flex flex-col gap-4">
              {gradeResult
                ? (
                    <div className={cn(
                      'rounded-xl border px-4 py-3',
                      gradeResult.score === 'excellent'
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : gradeResult.score === 'good'
                          ? 'border-blue-500/30 bg-blue-500/10'
                          : 'border-amber-500/30 bg-amber-500/10',
                    )}
                    >
                      <span className={cn(
                        'text-sm font-bold shrink-0 mt-0.5',
                        scoreColorMap[gradeResult.score] ?? 'text-muted-foreground',
                      )}
                      >
                        {scoreLabelMap[gradeResult.score] ?? gradeResult.score}
                      </span>
                      {gradeResult.feedback && (
                        <p className="text-sm leading-relaxed">{gradeResult.feedback}</p>
                      )}
                    </div>
                  )
                : (
                    <p className="text-sm text-muted-foreground">{t('reading.gradingFailed')}</p>
                  )}
              <Button size="lg" onClick={onComplete}>
                {t('vocab.makeASentence.continue')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )

  if (embedded)
    return content

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{t('queue.skill.reading')}</span>
      </div>
      {content}
    </div>
  )
}
