import type { TranslationKey } from '@/lib/i18n'
import type { SessionCompletePayload } from '@/lib/study-utils'
import {
  BookOpen,
  Check,
  Headphones,
  Languages,
  Mic,
  PencilLine,
  Puzzle,
  Sparkles,
  Type,
  X,
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'

import { cn } from '@/lib/utils'

const EXERCISE_META: Record<string, { labelKey: TranslationKey, icon: typeof Mic }> = {
  'pronunciation': { labelKey: 'study.mode.pronunciation', icon: Mic },
  'writing': { labelKey: 'study.mode.writing', icon: PencilLine },
  'dictation': { labelKey: 'study.mode.dictation', icon: Headphones },
  'romanization-recall': { labelKey: 'study.mode.romanization', icon: Type },
  'translation': { labelKey: 'study.mode.translation', icon: Languages },
  'cloze': { labelKey: 'study.mode.cloze', icon: Puzzle },
  'reconstruction': { labelKey: 'study.mode.reconstruction', icon: BookOpen },
}

const DASH_RE = /-/g

function metaFor(exercise: string): { labelKey: TranslationKey | null, fallbackLabel: string, icon: typeof Mic } {
  const hit = EXERCISE_META[exercise]
  if (hit)
    return { labelKey: hit.labelKey, fallbackLabel: exercise, icon: hit.icon }
  return { labelKey: null, fallbackLabel: exercise.replace(DASH_RE, ' '), icon: Sparkles }
}

function scoreTone(score: number) {
  if (score >= 85)
    return 'text-emerald-400'
  if (score >= 70)
    return 'text-amber-400'
  return 'text-rose-400'
}

export function SessionResultsCard({ payload }: { payload: SessionCompletePayload }) {
  const { t } = useI18n()
  const { results } = payload
  const total = results.length
  const correctCount = results.filter(r => r.correct).length
  const avgScore = total === 0
    ? 0
    : Math.round(results.reduce((s, r) => s + (r.score ?? 0), 0) / total)
  const accuracy = total === 0 ? 0 : Math.round((correctCount / total) * 100)

  const uniqueExercises = [...new Set(results.map(r => r.exercise))]
  const isMixed = uniqueExercises.length > 1
  const primaryMeta = isMixed
    ? { labelKey: 'study.mode.practice' as TranslationKey, fallbackLabel: 'Practice', icon: Sparkles }
    : metaFor(uniqueExercises[0] ?? '')
  const PrimaryIcon = primaryMeta.icon
  const primaryLabel = primaryMeta.labelKey ? t(primaryMeta.labelKey) : primaryMeta.fallbackLabel

  return (
    <div className="rounded-xl border border-border/60 bg-secondary backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PrimaryIcon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">
            {t('study.results.complete', { label: primaryLabel })}
          </div>
          <div className="text-xs text-muted-foreground leading-tight mt-0.5">
            {t(total === 1 ? 'study.results.itemCountOne' : 'study.results.itemCount', { count: total })}
            {isMixed ? t('study.results.typesSuffix', { count: uniqueExercises.length }) : ''}
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-lg font-semibold tabular-nums leading-none', scoreTone(avgScore))}>
            {avgScore}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{t('study.results.avg')}</div>
        </div>
      </div>

      {/* Accuracy bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">{t('study.accuracy')}</span>
          <span className="font-medium tabular-nums">
            {correctCount}
            /
            {total}
            {' '}
            <span className="text-muted-foreground">
              (
              {accuracy}
              %)
            </span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500/70 rounded-full transition-all"
            style={{ width: `${accuracy}%` }}
          />
        </div>
      </div>

      {/* Results list */}
      <ul className="px-2 py-2 mt-1 space-y-0.5">
        {results.map((r, idx) => {
          const meta = metaFor(r.exercise)
          const Icon = meta.icon
          return (
            <li
              key={`${r.vocabId}-${idx}`}
              className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
            >
              <div
                className={cn(
                  'flex size-5 items-center justify-center rounded-full shrink-0',
                  r.correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
                )}
              >
                {r.correct ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
              </div>
              {isMixed && (
                <Icon className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate text-sm font-medium">{r.word}</span>
              <span className={cn('text-xs font-semibold tabular-nums', scoreTone(r.score))}>
                {r.score}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
