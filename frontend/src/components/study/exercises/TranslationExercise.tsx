// frontend/src/components/study/exercises/TranslationExercise.tsx
import type { MistakeExample } from '@/db'
import type { LanguageCapabilities } from '@/lib/language-caps'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { HintButton } from '@/components/study/exercises/HintButton'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useHint } from '@/hooks/useHint'
import { API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'

const WHITESPACE_RE = /\s+/

interface Sentence {
  text: string
  romanization: string
  english: string
}

interface CategoryFeedback {
  score: number
  comment: string
}

interface EvaluateResult {
  overall_score: number
  accuracy: CategoryFeedback
  grammar: CategoryFeedback
  naturalness: CategoryFeedback
  tip: string
}

interface Props {
  sentence: Sentence
  direction: 'en-to-zh' | 'zh-to-en'
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean, mistakes?: MistakeExample[] }) => void
  caps: LanguageCapabilities
}

function scoreColor(n: number) {
  if (n >= 80)
    return 'text-emerald-400'
  if (n >= 60)
    return 'text-amber-400'
  return 'text-rose-400'
}

function barColor(n: number) {
  if (n >= 80)
    return 'bg-emerald-400'
  if (n >= 60)
    return 'bg-amber-400'
  return 'bg-rose-400'
}

function barGlow(n: number) {
  if (n >= 80)
    return 'shadow-[0_0_6px_rgba(52,211,153,0.55)]'
  if (n >= 60)
    return 'shadow-[0_0_6px_rgba(251,191,36,0.55)]'
  return 'shadow-[0_0_6px_rgba(251,113,133,0.5)]'
}

function scoreRingColor(n: number) {
  if (n >= 80)
    return 'border-emerald-500/25 bg-emerald-500/8'
  if (n >= 60)
    return 'border-amber-500/25 bg-amber-500/8'
  return 'border-rose-500/20 bg-rose-500/6'
}

function useScoreLabel() {
  const { t } = useI18n()
  return (n: number) => {
    if (n >= 80)
      return t('study.translation.excellent')
    if (n >= 60)
      return t('study.translation.goodEffort')
    return t('study.translation.keepPractising')
  }
}

function ScoreRow({ label, feedback }: { label: string, feedback: CategoryFeedback }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">{label}</span>
        <span className={cn('text-sm font-bold tabular-nums', scoreColor(feedback.score))}>
          {feedback.score}
          <span className="text-muted-foreground/50 font-normal text-sm">/100</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(feedback.score), barGlow(feedback.score))}
          style={{ width: `${feedback.score}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{feedback.comment}</p>
    </div>
  )
}

export function TranslationExercise({ sentence, direction, progress = '', onNext, caps }: Props) {
  const { keys } = useAuth()
  const { t } = useI18n()
  const scoreLabel = useScoreLabel()
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EvaluateResult | null>(null)

  const hint = useHint(direction === 'en-to-zh' ? 1 : 0)

  const wordBankItems: { word: string, pinyin: string }[] = (() => {
    const words = sentence.text.split(WHITESPACE_RE).filter(Boolean)
    const pinyins = (sentence.romanization ?? '').split(WHITESPACE_RE).filter(Boolean)
    if (words.length === pinyins.length)
      return words.map((w, i) => ({ word: w, pinyin: pinyins[i] }))
    return [{ word: sentence.text, pinyin: sentence.romanization ?? '' }]
  })()

  const source = direction === 'zh-to-en' ? sentence.text : sentence.english
  const reference = direction === 'zh-to-en' ? sentence.english : sentence.text
  const sourceLang = direction === 'zh-to-en' ? caps.languageName.toLowerCase() : 'english'
  const targetLang = direction === 'zh-to-en' ? 'english' : caps.languageName.toLowerCase()
  const placeholder = direction === 'zh-to-en'
    ? t('study.translation.placeholder.toEnglish')
    : t('study.translation.placeholder.toLanguage').replace('{language}', caps.languageName)

  async function handleSubmit() {
    if (!value.trim())
      return
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/translation/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          source,
          source_language: sourceLang,
          target_language: targetLang,
          reference,
          user_answer: value.trim(),
        }),
      })
      if (!resp.ok)
        throw new Error(`Evaluate failed (${resp.status})`)
      setResult(await resp.json())
    }
    catch {
      toast.error(t('study.translationEvaluationFailed'))
      onNext(0, { skipped: true })
    }
    finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <ExerciseCard type={t('study.mode.translation')} progress={progress} footer={null}>
        <div className="space-y-4">

          {/* Source + answer/reference comparison */}
          <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden text-sm">
            <div className="px-4 py-3 border-b border-border/40">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">{t('study.questionToTranslate')}</p>
              <p className="font-medium leading-snug">{source}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/40">
              <div className="px-3 py-2.5">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">{t('study.yourAnswer')}</p>
                <p className="text-sm italic text-foreground/75 leading-relaxed">{value}</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">{t('study.modelAnswer')}</p>
                <p className="text-sm text-foreground leading-relaxed">{reference}</p>
                {direction === 'en-to-zh' && (
                  <p className="text-sm text-muted-foreground mt-1">{sentence.romanization}</p>
                )}
              </div>
            </div>
          </div>

          {/* Overall score — hero */}
          <div className={cn('rounded-xl border px-5 py-4 flex items-center gap-4', scoreRingColor(result.overall_score))}>
            <span className={cn('text-5xl font-black tabular-nums leading-none', scoreColor(result.overall_score))}>
              {result.overall_score}
            </span>
            <div>
              <p className="text-sm text-muted-foreground leading-none mb-1">{t('study.outOf100')}</p>
              <p className={cn('text-sm font-bold', scoreColor(result.overall_score))}>{scoreLabel(result.overall_score)}</p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="space-y-4 pt-1">
            <ScoreRow label={t('study.translation.accuracy')} feedback={result.accuracy} />
            <ScoreRow label={t('study.translation.grammar')} feedback={result.grammar} />
            <ScoreRow label={t('study.translation.naturalness')} feedback={result.naturalness} />
          </div>

          {/* Tip */}
          {result.tip && (
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/8 px-4 py-3">
              <p className="text-sm font-bold uppercase tracking-widest text-sky-400/80 mb-1.5">{t('study.translation.tip')}</p>
              <p className="text-sm text-foreground/90 leading-relaxed">{result.tip}</p>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0]
              const mistakes: MistakeExample[] = result.overall_score < 100
                ? [{ userAnswer: value.trim(), correctAnswer: reference, context: source, date: today }]
                : []
              onNext(Math.round(result.overall_score * hint.hintScore), { mistakes: mistakes.length > 0 ? mistakes : undefined })
            }}
          >
            {t('study.nextButton')}
          </Button>
        </div>
      </ExerciseCard>
    )
  }

  return (
    <ExerciseCard type={t('study.mode.translation')} progress={progress} footer={null}>
      <div className="space-y-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            {t('study.translateTo')}
            {' '}
            {targetLang === 'english' ? 'English' : caps.languageName}
            :
          </p>
          <p className="text-2xl font-medium leading-snug">{source}</p>
          {direction === 'zh-to-en' && (
            <p className="text-sm text-muted-foreground mt-1">{sentence.romanization}</p>
          )}
        </div>

        {hint.level > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {wordBankItems.map(item => (
              <div
                key={item.word}
                className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border border-border/60 bg-muted/20 text-center"
              >
                <span className="text-base">{item.word}</span>
                <span className="text-xs text-muted-foreground">{item.pinyin}</span>
              </div>
            ))}
          </div>
        )}

        <LanguageInput
          langInputMode={direction === 'en-to-zh' ? caps.inputMode : 'standard'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              void handleSubmit()
          }}
          placeholder={placeholder}
          disabled={loading}
        />

        <div className="flex items-center justify-center gap-3">
          {direction === 'en-to-zh' && (
            <HintButton
              level={hint.level}
              totalLevels={1}
              exhausted={hint.exhausted}
              onHint={hint.revealNext}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNext(0, { skipped: true })}
          >
            {t('study.skip')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={loading || !value.trim()}
          >
            <Sparkles className="size-4" />
            {loading ? t('study.translation.evaluating') : t('study.translation.submit')}
          </Button>
        </div>
      </div>
    </ExerciseCard>
  )
}
