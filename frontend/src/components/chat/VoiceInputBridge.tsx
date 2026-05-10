import { useEffect, useRef, useState } from 'react'
import { usePromptInputController } from '@/components/ai-elements/prompt-input'

interface VoiceInputBridgeProps {
  /** Live partial transcript shown as overlay; '' to hide. */
  draftText: string
  /** Confirmed transcript to append, or null when nothing to flush. */
  pendingConfirmed: string | null
  /** Caller clears pendingConfirmed after the bridge has flushed it. */
  onConfirmedFlushed: () => void
}

export function VoiceInputBridge({ draftText, pendingConfirmed, onConfirmedFlushed }: VoiceInputBridgeProps) {
  const controller = usePromptInputController()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const isComposingRef = useRef(false)
  const [isComposing, setIsComposing] = useState(false)
  const queueRef = useRef('')

  // Watch IME composition on the textarea inside this PromptInput.
  useEffect(() => {
    // Scope the textarea lookup to the nearest ancestor PromptInput (rendered as <form>),
    // not the whole document — multiple companions may mount simultaneously.
    const root = anchorRef.current?.closest('form') ?? anchorRef.current?.parentElement
    const textarea = root?.querySelector<HTMLTextAreaElement>('textarea[data-slot="input-group-control"]')
    if (!textarea)
      return
    const onStart = () => {
      isComposingRef.current = true
      setIsComposing(true)
    }
    const onEnd = () => {
      isComposingRef.current = false
      setIsComposing(false)
      if (queueRef.current) {
        const text = queueRef.current
        queueRef.current = ''
        controller.textInput.setInput(prev => prev + text)
      }
    }
    textarea.addEventListener('compositionstart', onStart)
    textarea.addEventListener('compositionend', onEnd)
    return () => {
      textarea.removeEventListener('compositionstart', onStart)
      textarea.removeEventListener('compositionend', onEnd)
    }
  }, [controller])

  // Flush incoming confirmed text — queue if mid-composition.
  useEffect(() => {
    if (pendingConfirmed === null)
      return
    if (isComposingRef.current) {
      queueRef.current += pendingConfirmed
    }
    else {
      controller.textInput.setInput(prev => prev + pendingConfirmed)
    }
    onConfirmedFlushed()
  }, [pendingConfirmed, controller, onConfirmedFlushed])

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {draftText && !isComposing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-14 truncate text-sm italic text-muted-foreground/70"
        >
          {draftText}
        </div>
      )}
    </>
  )
}
