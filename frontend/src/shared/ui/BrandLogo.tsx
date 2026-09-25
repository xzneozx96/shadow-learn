import { cn } from '@/shared/lib/utils'

interface BrandLogoProps {
  className?: string
  compact?: boolean
  size?: 'sm' | 'md'
}

export function BrandLogo({ className, compact = false, size = 'md' }: BrandLogoProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <img
        src="/favicon.svg"
        className={cn('shrink-0', size === 'sm' ? 'size-7' : 'size-8')}
        alt={compact ? 'ShadowLearn' : ''}
      />
      {!compact && (
        <span className={cn('truncate font-extrabold tracking-[-0.045em]', size === 'sm' ? 'text-base' : 'text-lg')}>
          Shadow
          <span className="text-primary">Learn</span>
        </span>
      )}
    </span>
  )
}
