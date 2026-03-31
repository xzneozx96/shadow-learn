import { FileText, X } from 'lucide-react'

export interface ContextChip {
  id: string
  text: string
  source?: string
}

interface ContextChipBarProps {
  chips: ContextChip[]
  onRemoveChip: (id: string) => void
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function ContextChipBar({ chips, onRemoveChip }: ContextChipBarProps) {
  if (chips.length === 0)
    return null

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {chips.map(chip => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
          title={chip.text}
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate max-w-[200px]">{truncate(chip.text, 50)}</span>
          <button
            type="button"
            onClick={() => onRemoveChip(chip.id)}
            className="ml-0.5 shrink-0 rounded-sm p-0.5 hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
