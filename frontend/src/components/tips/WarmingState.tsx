import type { WarmingStep } from '@/hooks/useTipTranscript'
import type { TranslationKey } from '@/lib/i18n'
import { Check, Loader2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

type UiStep = 'fetch' | 'transcribe' | 'index'

const UI_STEPS: { id: UiStep, labelKey: TranslationKey, eta: string }[] = [
  { id: 'fetch', labelKey: 'tips.warming.step.fetch', eta: '~10s' },
  { id: 'transcribe', labelKey: 'tips.warming.step.transcribe', eta: '~25s' },
  { id: 'index', labelKey: 'tips.warming.step.index', eta: '~3s' },
]

function backendToUi(step: WarmingStep): UiStep {
  if (step === 'video_download' || step === 'audio_extraction')
    return 'fetch'
  if (step === 'transcription')
    return 'transcribe'
  return 'index'
}

function stateFor(ui: UiStep, current: UiStep, complete: boolean): 'done' | 'active' | 'pending' {
  if (complete)
    return 'done'
  const order: UiStep[] = ['fetch', 'transcribe', 'index']
  const currentIdx = order.indexOf(current)
  const idx = order.indexOf(ui)
  if (idx < currentIdx)
    return 'done'
  if (idx === currentIdx)
    return 'active'
  return 'pending'
}

export function WarmingState({ step, complete = false }: { step: WarmingStep, complete?: boolean }) {
  const { t } = useI18n()
  const current = backendToUi(step)
  return (
    <div className="rounded-xl border border-border bg-muted p-4">
      <div className="text-center mb-4">
        <div className="text-2xl mb-2" aria-hidden>✦</div>
        <div className="text-sm font-bold text-foreground">{t('tips.warming.headline')}</div>
        <div className="text-xs text-muted-foreground">{t('tips.warming.eta')}</div>
      </div>
      <ol className="space-y-2" role="list">
        {UI_STEPS.map((s) => {
          const state = stateFor(s.id, current, complete)
          return (
            <li
              key={s.id}
              data-step={s.id}
              data-state={state}
              className="flex items-center gap-3 text-xs"
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className={cn(
                'flex items-center justify-center size-[18px] rounded-full text-xs font-bold shrink-0',
                state === 'done' && 'bg-success text-white',
                state === 'active' && 'bg-primary text-white',
                state === 'pending' && 'border border-dashed border-border text-muted-foreground',
              )}
              >
                {state === 'done' ? <Check className="size-3" /> : state === 'active' ? <Loader2 className="size-3 motion-safe:animate-spin" /> : ''}
              </span>
              <span className={cn(
                'flex-1',
                state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                state === 'active' && 'font-bold',
              )}
              >
                {t(s.labelKey)}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{s.eta}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
