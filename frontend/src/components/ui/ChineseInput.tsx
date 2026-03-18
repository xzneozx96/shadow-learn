import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { getCandidates } from '@/lib/pinyin-dict'
import { cn } from '@/lib/utils'

const RE_DIGIT = /^[1-9]$/
const RE_LETTER = /^[a-z]$/i

interface ChineseInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  wrapperClassName?: string
}

const PAGE_SIZE = 9

export function ChineseInput({ value, onChange, onKeyDown, disabled, wrapperClassName, ...rest }: ChineseInputProps) {
  // buffer and page are combined so page resets atomically when buffer changes,
  // avoiding a useEffect setter (rerender-derived-state-no-effect).
  const [ime, setIme] = useState({ buffer: '', page: 0 })
  const { buffer, page } = ime
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)

  const allCandidates = getCandidates(buffer)
  const totalPages = Math.ceil(allCandidates.length / PAGE_SIZE)
  const candidates = allCandidates.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const showCandidates = allCandidates.length > 0

  // Derive bar position during render — ref is populated after first mount so this
  // always reflects the current layout without needing an effect + state round-trip.
  const wrapperRect = showCandidates ? wrapperRef.current?.getBoundingClientRect() : undefined
  const barPos = wrapperRect ? { top: wrapperRect.bottom + 4, left: wrapperRect.left } : null

  function fireChange(newValue: string) {
    const event = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(event)
  }

  function selectCandidate(char: string) {
    setIme({ buffer: '', page: 0 })
    fireChange(value + char)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposingRef.current)
      return

    // Candidate selection keys
    if (showCandidates) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        selectCandidate(candidates[0])
        return
      }
      if (RE_DIGIT.test(e.key)) {
        const idx = Number(e.key) - 1
        if (candidates[idx]) {
          e.preventDefault()
          selectCandidate(candidates[idx])
          return
        }
      }
      if (e.key === '=' && page < totalPages - 1) {
        e.preventDefault()
        setIme(s => ({ ...s, page: s.page + 1 }))
        return
      }
      if (e.key === '-' && page > 0) {
        e.preventDefault()
        setIme(s => ({ ...s, page: s.page - 1 }))
        return
      }
    }

    // Buffer editing
    if (RE_LETTER.test(e.key)) {
      e.preventDefault()
      setIme(s => ({ buffer: s.buffer + e.key.toLowerCase(), page: 0 }))
      return
    }

    if (e.key === 'Backspace' && buffer.length > 0) {
      e.preventDefault()
      setIme(s => ({ buffer: s.buffer.slice(0, -1), page: 0 }))
      return
    }

    if (e.key === 'Escape' && buffer.length > 0) {
      e.preventDefault()
      setIme({ buffer: '', page: 0 })
      return
    }

    // Only forward to parent when buffer is empty — never forward when
    // the user is mid-syllable, even if there are no candidates yet.
    if (buffer.length > 0)
      return

    onKeyDown?.(e)
  }

  const displayValue = value + buffer

  return (
    <div ref={wrapperRef} className={cn('relative', wrapperClassName)}>
      <Input
        {...rest}
        className="text-center text-xl!"
        value={displayValue}
        onChange={(e) => {
          // Forward direct value changes (e.g., programmatic/test fireEvent.change)
          // when buffer is empty. When buffer is active the display includes buffer chars
          // and direct changes would corrupt the committed value.
          if (!buffer)
            fireChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false
          // Let the OS IME commit its value normally
          const input = e.currentTarget
          fireChange(input.value)
          setIme({ buffer: '', page: 0 })
        }}
        disabled={disabled}
      />

      {showCandidates && barPos && createPortal(
        <div
          className="fixed z-50 flex items-center gap-1 rounded-md border border-border bg-popover shadow-md p-1"
          style={{ top: barPos.top, left: barPos.left }}
        >
          {totalPages > 1 && (
            <button
              type="button"
              tabIndex={-1}
              disabled={page === 0}
              className="px-1.5 py-1 rounded text-sm text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-default"
              onMouseDown={(e) => {
                e.preventDefault()
                setIme(s => ({ ...s, page: s.page - 1 }))
              }}
            >
              ‹
            </button>
          )}

          {candidates.map((char, i) => (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              className="flex items-center gap-0.5 px-2 py-1 rounded text-sm hover:bg-accent cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault()
                selectCandidate(char)
              }}
            >
              <span className="text-muted-foreground text-sm">{i + 1}</span>
              <span>{char}</span>
            </button>
          ))}

          {totalPages > 1 && (
            <>
              <span className="text-[10px] text-muted-foreground px-1 tabular-nums">
                {page + 1}
                /
                {totalPages}
              </span>
              <button
                type="button"
                tabIndex={-1}
                disabled={page === totalPages - 1}
                className="px-1.5 py-1 rounded text-sm text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-default"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIme(s => ({ ...s, page: s.page + 1 }))
                }}
              >
                ›
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
