import { Languages, Sparkles } from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/contexts/I18nContext'

interface SelectionMenuProps {
  rect: DOMRect
  selectedText: string
  isChinese: boolean
  onAddChip: () => void
  onDismiss: () => void
}

const MENU_WIDTH = 176
const ITEM_HEIGHT = 36
const GAP = 12

export function SelectionMenu({ rect, selectedText, isChinese, onAddChip, onDismiss }: SelectionMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pinyinResult, setPinyinResult] = useState<string | null>(null)

  useEffect(() => {
    setPinyinResult(null)
  }, [selectedText])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node))
        return
      onDismiss()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onDismiss])

  function handleShowPinyin() {
    const result = pinyin(selectedText, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' })
    setPinyinResult(result)
  }

  const itemCount = isChinese ? 2 : 1
  const pinyinRowHeight = pinyinResult ? 36 : 0
  const menuHeight = itemCount * ITEM_HEIGHT + pinyinRowHeight

  const showAbove = rect.top >= menuHeight + GAP
  const top = showAbove
    ? rect.top - menuHeight - GAP
    : rect.bottom + GAP

  // Center on selection, clamp within viewport
  const rawLeft = rect.left + rect.width / 2 - MENU_WIDTH / 2
  const left = Math.max(GAP, Math.min(rawLeft, window.innerWidth - MENU_WIDTH - GAP))

  return createPortal(
    <div
      ref={menuRef}
      data-selection-menu
      className="fixed z-9999 animate-in fade-in zoom-in-95 duration-100 overflow-hidden rounded-md border border-white/10 bg-black/20 backdrop-blur-2xl bg-linear-to-br from-zinc-800/30 to-zinc-800/50 shadow-xl"
      style={{ top: `${top}px`, left: `${left}px`, width: `${MENU_WIDTH}px` }}
    >
      <div>
        {pinyinResult && (
          <div className="border-b border-white/10 px-3 py-2 text-center text-sm font-medium tracking-widest text-white">
            {pinyinResult}
          </div>
        )}
        {isChinese && (
          <button
            type="button"
            onClick={handleShowPinyin}
            disabled={!!pinyinResult}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <Languages className="size-4 shrink-0 text-amber-400" />
            Pinyin
          </button>
        )}
        <button
          type="button"
          onClick={onAddChip}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors${isChinese ? ' border-t border-white/10' : ''}`}
        >
          <Sparkles className="size-4 shrink-0 text-primary" />
          {t('companion.selectionMenu')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
