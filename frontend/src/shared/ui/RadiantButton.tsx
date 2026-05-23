import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface RadiantButtonProps {
  onClick?: () => void
  children: ReactNode
  className?: string
  innerClassName?: string
  title?: string
  disabled?: boolean
  color?: string
  background?: string
  borderWidth?: number
  duration?: number
}

export function RadiantButton({
  onClick,
  children,
  className,
  innerClassName,
  title,
  disabled,
  color = '#c084fc',
  background = '#0b0b0d',
  borderWidth = 1.5,
  duration = 3,
}: RadiantButtonProps) {
  const style = {
    '--radiant-color': color,
    '--radiant-bg': background,
    '--radiant-border-width': `${borderWidth}px`,
    '--radiant-duration': `${duration}s`,
  } as CSSProperties

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      data-disabled={disabled ? 'true' : undefined}
      style={style}
      className={cn('radiant-btn rounded-lg cursor-pointer', className)}
    >
      <span className="radiant-border" aria-hidden />
      <span className="radiant-glow" aria-hidden />
      <span className={cn('radiant-content', innerClassName)}>{children}</span>
    </button>
  )
}
