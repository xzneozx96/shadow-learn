import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface SelectionMenuProps {
  rect: DOMRect
  onAddChip: () => void
  onDismiss: () => void
}

export function SelectionMenu({ rect, onAddChip, onDismiss }: SelectionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node))
        return
      onDismiss()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onDismiss])

  const top = rect.top - 36
  const left = rect.left + rect.width / 2

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-9999 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <button
        type="button"
        onClick={onAddChip}
        className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-primary shadow-lg hover:bg-primary/10 transition-colors"
      >
        <Sparkles className="size-3" />
        Ask AI Companion
      </button>
    </div>,
    document.body,
  )
}
