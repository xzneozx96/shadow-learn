import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Brain, ChevronDown, Circle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/collapsible'
import { TextShimmer } from '@/shared/ui/text-shimmer'

// -------------------------------------------------------------------------- //
// ChainOfThoughtItem
// -------------------------------------------------------------------------- //

export type ChainOfThoughtItemProps = ComponentProps<'div'>

export function ChainOfThoughtItem({
  children,
  className,
  ...props
}: ChainOfThoughtItemProps) {
  return (
    <div className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children}
    </div>
  )
}

// -------------------------------------------------------------------------- //
// ChainOfThought — outer collapsible panel
// -------------------------------------------------------------------------- //

export type ChainOfThoughtProps = ComponentProps<typeof Collapsible>

export function ChainOfThought({ className, ...props }: ChainOfThoughtProps) {
  return (
    <Collapsible
      className={cn(
        'not-prose w-full overflow-hidden rounded-md border border-border/60 bg-secondary/60 shadow-sm backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  )
}

// -------------------------------------------------------------------------- //
// ChainOfThoughtHeader — collapsible trigger for the outer panel
// -------------------------------------------------------------------------- //

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  isStreaming?: boolean
  label?: string
}

export function ChainOfThoughtHeader({
  className,
  children,
  isStreaming = false,
  label,
  ...props
}: ChainOfThoughtHeaderProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        'group text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-start gap-1 px-3 py-2 text-left text-sm transition-colors',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="relative inline-flex size-4 items-center justify-center">
          {isStreaming
            ? (
                <Brain className="size-4 animate-pulse text-primary" />
              )
            : (
                <>
                  <Circle className="size-2 fill-current transition-opacity group-hover:opacity-0" />
                  <ChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:rotate-180" />
                </>
              )}
        </span>
        {label
          ? (
              isStreaming
                ? (
                    <TextShimmer as="span" className="text-sm font-semibold" duration={1.6}>
                      {label}
                    </TextShimmer>
                  )
                : (
                    <span className="text-sm font-semibold">
                      {label}
                    </span>
                  )
            )
          : (
              children
            )}
      </div>
    </CollapsibleTrigger>
  )
}

// -------------------------------------------------------------------------- //
// ChainOfThoughtContent — the list of steps inside the panel
// -------------------------------------------------------------------------- //

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>

export function ChainOfThoughtContent({
  className,
  children,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'text-popover-foreground overflow-hidden',
        className,
      )}
      {...props}
    >
      <div className="relative border-t border-border px-3 py-2">
        {children}
      </div>
    </CollapsibleContent>
  )
}

// -------------------------------------------------------------------------- //
// ChainOfThoughtStep — individual step, itself collapsible when it has content
// -------------------------------------------------------------------------- //

export interface ChainOfThoughtStepProps {
  icon?: LucideIcon
  label: string
  description?: string
  status: 'complete' | 'active' | 'pending' | 'error'
  children?: ReactNode
  className?: string
  isLast?: boolean
}

function StatusDot({ status }: { status: ChainOfThoughtStepProps['status'] }) {
  return (
    <span
      className={cn(
        'size-2 rounded-full shrink-0 transition-colors',
        status === 'active' && 'bg-primary animate-pulse',
        status === 'complete' && 'bg-emerald-500',
        status === 'error' && 'bg-destructive',
        status === 'pending' && 'bg-muted-foreground/25',
      )}
    />
  )
}

export function ChainOfThoughtStep({
  icon: Icon,
  label,
  description,
  status,
  children,
  className,
  isLast = false,
}: ChainOfThoughtStepProps) {
  const hasContent = !!(description || children)

  const [open, setOpen] = useState(status === 'active' || status === 'error')

  useEffect(() => {
    if (status === 'active' || status === 'error') {
      setOpen(true)
    }
    else if (status === 'complete') {
      setOpen(false)
    }
  }, [status])

  const labelClass = cn(
    'min-w-0 flex-1 text-xs leading-tight',
    status === 'complete' && 'text-muted-foreground',
    status === 'active' && 'text-foreground font-medium',
    status === 'pending' && 'text-muted-foreground/60',
    status === 'error' && 'text-destructive',
  )

  const iconEl = Icon
    ? (
        <Icon className="size-3.5 text-muted-foreground/70" />
      )
    : (
        <StatusDot status={status} />
      )

  // No content — render a plain non-interactive row
  if (!hasContent) {
    return (
      <div className={cn('group', className)} data-last={isLast}>
        <div className="text-muted-foreground flex items-center gap-2 py-0.5 text-sm transition-colors">
          <span className="relative inline-flex size-4 items-center justify-center">
            {iconEl}
          </span>
          <span className={labelClass}>{label}</span>
        </div>
        <div className="flex justify-start group-data-[last=true]:hidden">
          <div className="bg-primary/20 ml-[7px] h-4 w-px" />
        </div>
      </div>
    )
  }

  // Has content — render as collapsible step
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('group', className)}
      data-last={isLast}
    >
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-between gap-1 text-left text-sm transition-colors">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex size-4 items-center justify-center">
            {iconEl}
          </span>
          <span className={labelClass}>{label}</span>
        </div>
        <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="relative">
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-primary/20 group-data-[last=true]:hidden" />
          <div className="ml-4 mt-2 space-y-2">
            {description && (
              <div
                className={cn(
                  'max-h-[300px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed scrollbar-thin',
                  status === 'error'
                    ? 'rounded-md bg-destructive/10 px-2.5 py-2 text-destructive'
                    : 'py-1 pr-1 text-muted-foreground/75',
                )}
              >
                {description}
              </div>
            )}
            {children}
          </div>
        </div>
      </CollapsibleContent>
      <div className="flex justify-start group-data-[last=true]:hidden">
        <div className="bg-primary/20 ml-[7px] h-4 w-px" />
      </div>
    </Collapsible>
  )
}
