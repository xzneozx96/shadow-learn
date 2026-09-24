import type { ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'
import { Input } from './input'

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, 'type'> {
  showLabel: string
  hideLabel: string
}

export function PasswordInput({ showLabel, hideLabel, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
        aria-label={visible ? hideLabel : showLabel}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  )
}
