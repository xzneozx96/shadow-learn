import type { ReactNode } from 'react'
import type { ContextChip } from '@/components/chat/ContextChipBar'
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import { SelectionMenu } from '@/components/chat/SelectionMenu'

const CJK_REGEX = /[\u4E00-\u9FFF]/
const SCRUB_RE = /<(system|tool|prompt|instructions?)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

// eslint-disable-next-line react-refresh/only-export-components
export function scrub(text: string): string {
  return text.replace(SCRUB_RE, '')
}

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
    const cleanText = scrub(text)
    setChips(prev => [...prev, { id: crypto.randomUUID(), text: cleanText, source }])
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
    let isMouseDown = false
    let pendingSelection: SelectionState | null = null

    function readSelection(): SelectionState | null {
      const selection = window.getSelection()
      const text = selection?.toString().trim()
      if (!text)
        return null
      const anchorNode = selection?.anchorNode
      if (anchorNode?.parentElement?.closest('input, textarea, [contenteditable]'))
        return null
      try {
        const range = selection?.getRangeAt(0)
        if (!range)
          return null
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0)
          return null
        return { text, rect }
      }
      catch {
        return null
      }
    }

    function handleMouseDown(e: MouseEvent) {
      if ((e.target as Element).closest?.('[data-selection-menu]'))
        return
      isMouseDown = true
      pendingSelection = null
      setSelectionState(null)
    }

    function handleMouseUp() {
      isMouseDown = false
      if (pendingSelection) {
        setSelectionState(pendingSelection)
        pendingSelection = null
      }
    }

    function handleSelectionChange() {
      const state = readSelection()
      if (isMouseDown) {
        pendingSelection = state
      }
      else {
        setSelectionState(state)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
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
              selectedText={selectionState.text}
              isChinese={CJK_REGEX.test(selectionState.text)}
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
