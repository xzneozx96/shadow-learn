import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface GlowIconPlaceholderProps extends HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode
}

export function GlowIconPlaceholder({ icon, className, ...props }: GlowIconPlaceholderProps) {
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden', className)}
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 70%), #0a0a0c' }}
      {...props}
    >
      <div className="absolute size-20 rounded-full bg-primary/10 blur-2xl" />
      <div
        className="relative rounded-3xl p-1.5 ring-1 ring-white/8"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div
          className="flex size-15 items-center justify-center rounded-[calc(1.5rem-0.375rem)]"
          style={{
            background: 'linear-gradient(135deg, rgba(129,140,248,0.14) 0%, rgba(99,102,241,0.07) 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.10)',
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
