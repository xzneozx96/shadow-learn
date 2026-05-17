import { ChevronDown, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  disabled?: boolean
}

export function OverviewBlock({ disabled = false }: Props) {
  const [open, setOpen] = useState(true)
  const caption = disabled ? 'unlocks when transcript is ready' : '3 key takeaways'
  const body = disabled
    ? 'The tutor will summarize this lesson once the transcript is ready.'
    : '(B2 will render the AI summary and key takeaways here.)'

  return (
    <section aria-label="AI lesson overview" className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/10 px-2.5 py-1 rounded-full font-bold">
          <Sparkles className="size-3" aria-hidden />
          AI overview
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
