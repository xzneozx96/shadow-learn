// frontend/src/components/study/exercises/TranslationExercise.tsx
import { use, useState } from 'react'
import { toast } from 'sonner'
import { AuthContext } from '@/contexts/AuthContext'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { ChineseInput } from '@/components/ui/ChineseInput'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface Sentence {
  chinese: string
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
  onNext: (correct: boolean) => void
}

function scoreColor(n: number) {
  if (n >= 80) return 'text-emerald-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-destructive'
}

function barColor(n: number) {
  if (n >= 80) return 'bg-emerald-400'
  if (n >= 60) return 'bg-amber-400'
  return 'bg-destructive'
}

function ScoreRow({ label, feedback }: { label: string, feedback: CategoryFeedback }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-semibold tabular-nums', scoreColor(feedback.score))}>
          {feedback.score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor(feedback.score))}
          style={{ width: `${feedback.score}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{feedback.comment}</p>
    </div>
  )
}

export function TranslationExercise({ sentence, direction, progress = '', onNext }: Props) {
  const { keys } = use(AuthContext)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EvaluateResult | null>(null)

  const source = direction === 'zh-to-en' ? sentence.chinese : sentence.english
  const reference = direction === 'zh-to-en' ? sentence.english : sentence.chinese
  const sourceLang = direction === 'zh-to-en' ? 'chinese' : 'english'
  const targetLang = direction === 'zh-to-en' ? 'english' : 'chinese'
  const placeholder = direction === 'zh-to-en' ? 'Type your English translation…' : 'Type your Chinese translation…'

  async function handleSubmit() {
    if (!value.trim() || !keys?.openrouterApiKey) return
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
      if (!resp.ok) throw new Error(`Evaluate failed (${resp.status})`)
      setResult(await resp.json())
    }
    catch {
      toast.error('Translation evaluation failed. Moving on.')
      onNext(false)
    }
    finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <ExerciseCard type="Translation" progress={progress} footer={null}>
        <div className="space-y-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Your translation of:</p>
            <p className="text-lg font-medium">{source}</p>
            <p className="text-sm text-muted-foreground mt-1 italic">{value}</p>
            <p className="text-xs text-muted-foreground mt-2">Reference: <span className="text-foreground not-italic">{reference}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold tabular-nums">
              <span className={scoreColor(result.overall_score)}>{result.overall_score}</span>
              <span className="text-muted-foreground text-lg">/100</span>
            </span>
            <span className="text-sm text-muted-foreground">Overall score</span>
          </div>

          <div className="space-y-4">
            <ScoreRow label="Accuracy" feedback={result.accuracy} />
            <ScoreRow label="Grammar" feedback={result.grammar} />
            <ScoreRow label="Naturalness" feedback={result.naturalness} />
          </div>

          {result.tip && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              <span className="font-medium">Tip: </span>{result.tip}
            </div>
          )}

          <Button className="w-full" onClick={() => onNext(result.overall_score >= 60)}>
            Next
          </Button>
        </div>
      </ExerciseCard>
    )
  }

  return (
    <ExerciseCard type="Translation" progress={progress} footer={null}>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Translate to {targetLang === 'english' ? 'English' : 'Chinese'}:
          </p>
          <p className="text-2xl font-medium leading-snug">{source}</p>
        </div>

        {direction === 'en-to-zh'
          ? (
              <ChineseInput
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                placeholder={placeholder}
                disabled={loading}
              />
            )
          : (
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSubmit() }}
                placeholder={placeholder}
                maxLength={500}
                disabled={loading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            )}

        <Button
          className="w-full"
          onClick={() => void handleSubmit()}
          disabled={loading || !value.trim()}
        >
          {loading ? 'Evaluating…' : 'Submit'}
        </Button>
      </div>
    </ExerciseCard>
  )
}
