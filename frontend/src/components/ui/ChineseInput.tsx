import { useEffect, useRef, useState } from 'react'
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

export function ChineseInput({ value, onChange, onKeyDown, disabled, wrapperClassName, ...rest }: ChineseInputProps) {
  const [buffer, setBuffer] = useState('')
  const [barPos, setBarPos] = useState<{ top: number, left: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)

  const candidates = getCandidates(buffer)
  const showCandidates = candidates.length > 0

  // Reposition candidate bar when buffer changes.
  // Uses `position: fixed` so coordinates are viewport-relative — do NOT add scrollY/scrollX.
  useEffect(() => {
    if (!showCandidates || !wrapperRef.current) {
      setBarPos(null)
      return
    }
    const rect = wrapperRef.current.getBoundingClientRect()
    setBarPos({ top: rect.bottom + 4, left: rect.left })
  }, [buffer])

  function fireChange(newValue: string) {
    const event = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(event)
  }

  function selectCandidate(char: string) {
    setBuffer('')
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
    }

    // Buffer editing
    if (RE_LETTER.test(e.key)) {
      e.preventDefault()
      setBuffer(b => b + e.key.toLowerCase())
      return
    }

    if (e.key === 'Backspace' && buffer.length > 0) {
      e.preventDefault()
      setBuffer(b => b.slice(0, -1))
      return
    }

    if (e.key === 'Escape' && buffer.length > 0) {
      e.preventDefault()
      setBuffer('')
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
        value={displayValue}
        onChange={() => {}} // controlled via keyDown interception
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false
          // Let the OS IME commit its value normally
          const input = e.currentTarget
          fireChange(input.value)
          setBuffer('')
        }}
        disabled={disabled}
      />

      {showCandidates && barPos && createPortal(
        <div
          className="fixed z-50 flex gap-1 rounded-md border border-border bg-popover shadow-md p-1"
          style={{ top: barPos.top, left: barPos.left }}
        >
          {candidates.slice(0, 9).map((char, i) => (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              className={cn(
                'flex items-center gap-0.5 px-2 py-1 rounded text-sm hover:bg-accent cursor-pointer',
              )}
              onMouseDown={(e) => {
                e.preventDefault() // prevent input blur
                selectCandidate(char)
              }}
            >
              <span className="text-muted-foreground text-xs">{i + 1}</span>
              <span>{char}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
