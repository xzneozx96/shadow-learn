import { Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

interface SessionOverlaysProps {
  evaluationStatus: 'idle' | 'generating' | 'complete'
  agentDisconnected: boolean
  onRetry?: () => void
  onViewRecap?: () => void
}

export function SessionOverlays({ evaluationStatus, agentDisconnected, onRetry, onViewRecap }: SessionOverlaysProps) {
  const { t } = useI18n()

  if (evaluationStatus === 'generating') {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm gap-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-base font-semibold text-foreground">{t('speak.generatingSummary')}</p>
        <p className="text-sm text-muted-foreground">{t('speak.generatingSummaryHint')}</p>
      </div>
    )
  }

  if (agentDisconnected) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm gap-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Info size={24} className="text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground">{t('speak.status.disconnected')}</p>
        <p className="text-sm text-muted-foreground">{t('speak.status.inactivity')}</p>
        <div className="flex gap-3 mt-2">
          {onRetry && (
            <Button size="lg" variant="outline" onClick={onRetry}>
              {t('speak.tryAgain')}
            </Button>
          )}
          {onViewRecap && (
            <Button size="lg" onClick={onViewRecap}>
              {t('speak.viewRecap')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return null
}
