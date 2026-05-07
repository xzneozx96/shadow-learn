import { cn } from '@/lib/utils'

export function BentoCard({ children, className, glow }: {
  children: React.ReactNode
  className?: string
  glow?: 'tr' | 'br' | 'tl' | 'bl'
}) {
  return (
    <div className={cn(
      'group relative h-full overflow-hidden rounded-2xl border border-white/8 bg-card backdrop-blur-sm p-3 xl:p-6 transition-colors duration-300 hover:border-white/12',
      className,
    )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute size-36 rounded-full bg-primary/8 blur-3xl',
          glow === 'tr' && '-top-14 -right-14',
          glow === 'br' && '-bottom-14 -right-14',
          glow === 'tl' && '-top-14 -left-14',
          glow === 'bl' && '-bottom-14 -left-14',
        )}
      />
      <div className="relative h-full">
        {children}
      </div>
    </div>
  )
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  )
}
