import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

export type StepStatus = 'pending' | 'active' | 'done' | 'error'

export interface PipelineStep {
  id: string
  label: string
  status: StepStatus
  error?: string
}

interface ProcessingStatusProps {
  steps: PipelineStep[]
  onRetry?: () => void
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'active':
      return <Loader2 className="size-4 animate-spin text-emerald-400" />
    case 'done':
      return <Check className="size-4 text-emerald-400" />
    case 'error':
      return <X className="size-4 text-destructive" />
    default:
      return <div className="size-4 rounded-full border-2 border-white/15" />
  }
}

export function ProcessingStatus({ steps, onRetry }: ProcessingStatusProps) {
  const { t } = useI18n()
  const hasError = steps.some(s => s.status === 'error')

  return (
    <div className="space-y-3" data-testid="create-lesson-processing-status">
      {steps.map(step => (
        <div key={step.id} className="flex items-center gap-3" data-testid={`create-lesson-processing-step-${step.id}`}>
          <StepIcon status={step.status} />
          <span className="text-sm text-white/65">{step.label}</span>
          {step.status === 'error' && step.error && (
            <span className="text-sm text-destructive" data-testid={`create-lesson-processing-step-${step.id}-error`}>{step.error}</span>
          )}
        </div>
      ))}

      {hasError && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="create-lesson-processing-retry-button">
          {t('create.processing.retry')}
        </Button>
      )}
    </div>
  )
}
