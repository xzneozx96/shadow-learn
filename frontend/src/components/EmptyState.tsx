import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GlowIconPlaceholder } from '@/components/library/GlowIconPlaceholder'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
  disabled?: boolean
}

interface EmptyStateProps {
  icon: ReactNode
  title?: string
  description?: string
  action?: EmptyStateAction
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-5 px-6 py-12 text-center', className)}>
      <GlowIconPlaceholder
        icon={icon}
        className="size-24 rounded-3xl"
      />
      {(title || description) && (
        <div className="flex flex-col gap-2">
          {title && <h3 className="text-xl font-semibold text-foreground">{title}</h3>}
          {description && (
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {action && (
        action.href
          ? (
              <Link to={action.href} className={buttonVariants()}>
                {action.icon}
                {action.label}
              </Link>
            )
          : (
              <Button size="lg" onClick={action.onClick} disabled={action.disabled}>
                {action.icon}
                {action.label}
              </Button>
            )
      )}
    </div>
  )
}
