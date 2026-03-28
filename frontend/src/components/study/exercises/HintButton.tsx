import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface HintButtonProps {
  level: number
  totalLevels: number
  exhausted: boolean
  onHint: () => void
  className?: string
}

export function HintButton({ level, totalLevels, exhausted, onHint, className }: HintButtonProps) {
  const { t } = useI18n()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={exhausted}
      onClick={onHint}
      className={cn('gap-1.5', className)}
    >
      <Lightbulb className="size-3.5" />
      {t('study.hint')}
      {level > 0 && (
        <span className="bg-muted text-muted-foreground rounded-sm px-1 text-xs font-mono">
          {level}
          /
          {totalLevels}
        </span>
      )}
    </Button>
  )
}
