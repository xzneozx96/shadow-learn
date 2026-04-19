import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLevelColor(level: string) {
  switch (level.toLowerCase()) {
    case 'beginner': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    case 'intermediate': return 'bg-sky-500/10 text-sky-500 border-sky-500/20'
    case 'advanced': return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    default: return 'bg-secondary text-secondary-foreground border-border'
  }
}
