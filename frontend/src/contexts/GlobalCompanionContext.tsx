import type { ReactNode } from 'react'
import type { ContextChip } from '@/components/chat/ContextChipBar'
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import { SelectionMenu } from '@/components/chat/SelectionMenu'

interface GlobalCompanionContextValue {
  chips: ContextChip[]
  isGlobalPanelOpen: boolean
  addChip: (text: string, source?: string) => void
  removeChip: (id: string) => void
  clearChips: () => void
  openPanel: () => void
  closePanel: () => void
}

const GlobalCompanionContext = createContext<GlobalCompanionContextValue | null>(null)

interface SelectionState {
  text: string
  rect: DOMRect
}

export function GlobalCompanionProvider({ children }: { children: ReactNode }) {
  const [chips, setChips] = useState<ContextChip[]>([])
  const [isGlobalPanelOpen, setIsGlobalPanelOpen] = useState(false)
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)

  // rerender-functional-setstate: stable callbacks with no stale closures
  const addChip = useCallback((text: string, source?: string) => {
    setChips(prev => [...prev, { id: crypto.randomUUID(), text, source }])
    setIsGlobalPanelOpen(true)
  }, [])

  const removeChip = useCallback((id: string) => {
    setChips(prev => prev.filter(c => c.id !== id))
  }, [])

  const clearChips = useCallback(() => setChips([]), [])
  const openPanel = useCallback(() => setIsGlobalPanelOpen(true), [])
  const closePanel = useCallback(() => setIsGlobalPanelOpen(false), [])

  // Selection listener — advanced-event-handler-refs pattern
  const addChipRef = useRef(addChip)
  addChipRef.current = addChip

  useEffect(() => {
    function handleSelectionChange() {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (!text) {
        setSelectionState(null)
        return
      }

      // Ignore selections inside inputs/textareas/contenteditable
      const anchorNode = selection?.anchorNode
      if (anchorNode?.parentElement?.closest('input, textarea, [contenteditable]')) {
        setSelectionState(null)
        return
      }

      try {
        const range = selection?.getRangeAt(0)
        if (!range) {
          setSelectionState(null)
          return
        }
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
          setSelectionState(null)
          return
        }
        setSelectionState({ text, rect })
      }
      catch {
        setSelectionState(null)
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  const handleAddChipFromSelection = useCallback(() => {
    if (!selectionState)
      return
    addChipRef.current(selectionState.text)
    setSelectionState(null)
    window.getSelection()?.removeAllRanges()
  }, [selectionState])

  const handleDismissSelection = useCallback(() => {
    setSelectionState(null)
  }, [])

  const value: GlobalCompanionContextValue = {
    chips,
    isGlobalPanelOpen,
    addChip,
    removeChip,
    clearChips,
    openPanel,
    closePanel,
  }

  return (
    <GlobalCompanionContext value={value}>
      {children}
      {selectionState
        ? (
            <SelectionMenu
              rect={selectionState.rect}
              onAddChip={handleAddChipFromSelection}
              onDismiss={handleDismissSelection}
            />
          )
        : null}
    </GlobalCompanionContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGlobalCompanionContext() {
  const ctx = use(GlobalCompanionContext)
  if (!ctx)
    throw new Error('useGlobalCompanionContext must be used within GlobalCompanionProvider')
  return ctx
}
