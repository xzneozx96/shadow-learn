// frontend/src/components/study/exercises/TranslationExercise.tsx
import type { LanguageCapabilities } from '@/lib/language-caps'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { LanguageInput } from '@/components/ui/LanguageInput'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

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
  onNext: (score: number, opts?: { skipped?: boolean }) => void
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

function scoreLabel(n: number) {
  if (n >= 80)
    return 'Excellent'
  if (n >= 60)
    return 'Good effort'
  return 'Keep practising'
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
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EvaluateResult | null>(null)

  const source = direction === 'zh-to-en' ? sentence.text : sentence.english
  const reference = direction === 'zh-to-en' ? sentence.english : sentence.text
  const sourceLang = direction === 'zh-to-en' ? caps.languageName.toLowerCase() : 'english'
  const targetLang = direction === 'zh-to-en' ? 'english' : caps.languageName.toLowerCase()
  const placeholder = direction === 'zh-to-en' ? 'Type your English translation…' : `Type your ${caps.languageName} translation…`

  async function handleSubmit() {
    if (!value.trim() || !keys?.openrouterApiKey)
      return
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/translation/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_api_key: keys.openrouterApiKey,
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
      toast.error('Translation evaluation failed. Moving on.')
      onNext(0)
    }
    finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <ExerciseCard type="Translation" progress={progress} footer={null}>
        <div className="space-y-4">

          {/* Source + answer/reference comparison */}
          <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden text-sm">
            <div className="px-4 py-3 border-b border-border/40">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Question to translate</p>
              <p className="font-medium leading-snug">{source}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/40">
              <div className="px-3 py-2.5">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Your answer</p>
                <p className="text-sm italic text-foreground/75 leading-relaxed">{value}</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Model answer</p>
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
              <p className="text-sm text-muted-foreground leading-none mb-1">out of 100</p>
              <p className={cn('text-sm font-bold', scoreColor(result.overall_score))}>{scoreLabel(result.overall_score)}</p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="space-y-4 pt-1">
            <ScoreRow label="Accuracy" feedback={result.accuracy} />
            <ScoreRow label="Grammar" feedback={result.grammar} />
            <ScoreRow label="Naturalness" feedback={result.naturalness} />
          </div>

          {/* Tip */}
          {result.tip && (
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/8 px-4 py-3">
              <p className="text-sm font-bold uppercase tracking-widest text-sky-400/80 mb-1.5">Tip</p>
              <p className="text-sm text-foreground/90 leading-relaxed">{result.tip}</p>
            </div>
          )}

          <Button className="w-full" onClick={() => onNext(result.overall_score)}>
            Next →
          </Button>
        </div>
      </ExerciseCard>
    )
  }

  return (
    <ExerciseCard type="Translation" progress={progress} footer={null}>
      <div className="space-y-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Translate to
            {' '}
            {targetLang === 'english' ? 'English' : caps.languageName}
            :
          </p>
          <p className="text-2xl font-medium leading-snug">{source}</p>
          {direction === 'zh-to-en' && (
            <p className="text-sm text-muted-foreground mt-1">{sentence.romanization}</p>
          )}
        </div>

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNext(0, { skipped: true })}
          >
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={loading || !value.trim()}
          >
            <Sparkles className="size-4" />
            {loading ? 'Evaluating…' : 'Submit'}
          </Button>
        </div>
      </div>
    </ExerciseCard>
  )
}
