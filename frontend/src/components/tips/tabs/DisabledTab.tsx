import type { LucideIcon } from 'lucide-react'
import { Lock } from 'lucide-react'

interface Props { Icon: LucideIcon, label: string, reason: string }

export function DisabledTab({ Icon, label, reason }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
      <div className="relative mb-4">
        <Icon className="size-10 opacity-40" />
        <Lock className="absolute -bottom-1 -right-1 size-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-bold text-foreground mb-1">
        {label}
        {' '}
        coming in B2
      </div>
      <div className="text-xs max-w-[260px]">{reason}</div>
    </div>
  )
}
