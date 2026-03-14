import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
      return <div className="size-4 rounded-full border-2 border-slate-600" />
  }
}

export function ProcessingStatus({ steps, onRetry }: ProcessingStatusProps) {
  const hasError = steps.some(s => s.status === 'error')

  return (
    <div className="space-y-3">
      {steps.map(step => (
        <div key={step.id} className="flex items-center gap-3">
          <StepIcon status={step.status} />
          <span className="text-sm text-slate-300">{step.label}</span>
          {step.status === 'error' && step.error && (
            <span className="text-xs text-destructive">{step.error}</span>
          )}
        </div>
      ))}

      {hasError && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
