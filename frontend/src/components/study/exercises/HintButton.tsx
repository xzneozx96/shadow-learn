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
  iconOnly?: boolean
}

export function HintButton({ level, totalLevels, exhausted, onHint, className, iconOnly = false }: HintButtonProps) {
  const { t } = useI18n()
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      disabled={exhausted}
      onClick={onHint}
      aria-label={level > 0 ? `${t('study.hint')} ${level}/${totalLevels}` : t('study.hint')}
      className={cn(
        !iconOnly && 'gap-1.5',
        'text-yellow-500',
        className,
      )}
    >
      <Lightbulb className="size-4" />
      {!iconOnly && t('study.hint')}
      {!iconOnly && level > 0 && (
        <span className="bg-muted text-muted-foreground rounded-sm px-1 text-xs font-mono" aria-hidden="true">
          {level}
          /
          {totalLevels}
        </span>
      )}
    </Button>
  )
}
