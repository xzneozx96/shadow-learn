import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface ExerciseCardProps {
  type: string
  progress: string
  footer: ReactNode | null
  children: ReactNode
  className?: string
  info?: string
}

export function ExerciseCard({ type, progress, footer, children, className, info }: ExerciseCardProps) {
  return (
    <div className={cn('max-w-[90%] rounded-xl border border-border bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[18px] py-3 border-b border-border">
        <div className="size-[7px] rounded-full bg-muted-foreground/50 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/90">
          {type}
        </span>
        {info && (
          <Popover>
            <PopoverTrigger
              type="button"
              aria-label="About this exercise"
              className="flex items-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <Info className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm">
              <p className="font-semibold mb-1">{type}</p>
              <p className="text-muted-foreground">{info}</p>
            </PopoverContent>
          </Popover>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">{progress}</span>
      </div>
      {/* Body */}
      <div className="px-[18px] py-5">{children}</div>
      {/* Footer */}
      {footer !== null && (
        <div className="border-t border-border">{footer}</div>
      )}
    </div>
  )
}
