import { GraduationCap, X } from 'lucide-react'
import { toast } from 'sonner'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'

interface GuidedModeToggleProps {
  guided: boolean
  setGuided: (v: boolean) => void
  tooltip: string
  onToast: string
  offToast: string
}

export function GuidedModeToggle({ guided, setGuided, tooltip, onToast, offToast }: GuidedModeToggleProps) {
  if (guided) {
    return (
      <PromptInputButton
        title={tooltip}
        aria-label={offToast}
        onClick={() => {
          setGuided(false)
          toast.success(offToast)
        }}
        data-state="on"
        className="bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary rounded-full px-3"
      >
        <GraduationCap className="size-4" />
        <span className="text-xs font-medium">{tooltip}</span>
        <X className="size-4 opacity-70" />
      </PromptInputButton>
    )
  }
  return (
    <PromptInputButton
      size="icon-sm"
      title={tooltip}
      aria-label={tooltip}
      onClick={() => {
        setGuided(true)
        toast.success(onToast)
      }}
      data-state="off"
    >
      <GraduationCap className="size-4" />
    </PromptInputButton>
  )
}
