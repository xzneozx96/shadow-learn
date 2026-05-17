import { ChevronDown, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface Props {
  disabled?: boolean
}

export function OverviewBlock({ disabled = false }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const caption = disabled ? t('tips.overview.locked') : t('tips.overview.ready')
  const body = disabled ? t('tips.overview.locked_body') : t('tips.overview.ready_body')

  return (
    <section aria-label={t('tips.overview.aria')} className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/10 px-2.5 py-1 rounded-full font-bold">
          <Sparkles className="size-3" aria-hidden />
          {t('tips.overview.badge')}
        </span>
        <span className="text-xs font-bold text-muted-foreground">{caption}</span>
        <ChevronDown
          aria-hidden
          className={cn('ml-auto size-3 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3.5">
          <div className="text-sm text-muted-foreground">{body}</div>
        </div>
      )}
    </section>
  )
}
