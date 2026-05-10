import type { VoiceInputState } from '@/hooks/useVoiceInput'
import { useEffect, useRef } from 'react'
import { usePromptInputController } from '@/components/ai-elements/prompt-input'

interface VoiceInputBridgeProps {
  voiceState: VoiceInputState
  /** Live partial transcript to show inline in textarea. */
  draftText: string
  /** Confirmed transcript to lock in, or null when nothing to flush. */
  pendingConfirmed: string | null
  onConfirmedFlushed: () => void
  /** True when recording was cancelled — signals bridge to restore pre-recording text. */
  restoreBase: boolean
  onRestoreHandled: () => void
}

export function VoiceInputBridge({
  voiceState,
  draftText,
  pendingConfirmed,
  onConfirmedFlushed,
  restoreBase,
  onRestoreHandled,
}: VoiceInputBridgeProps) {
  const controller = usePromptInputController()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const baseTextRef = useRef('')
  const prevVoiceStateRef = useRef<VoiceInputState>('idle')
  const isComposingRef = useRef(false)
  const compositionQueueRef = useRef('')

  // Capture base text when voice activates (idle → any active state).
  useEffect(() => {
    const prev = prevVoiceStateRef.current
    prevVoiceStateRef.current = voiceState
    if (prev === 'idle' && voiceState !== 'idle') {
      baseTextRef.current = controller.textInput.value
    }
  }, [voiceState, controller])

  // IME gating: queue confirmed text that arrives mid-composition.
  useEffect(() => {
    const root = anchorRef.current?.closest('form') ?? anchorRef.current?.parentElement
    const textarea = root?.querySelector<HTMLTextAreaElement>('textarea[data-slot="input-group-control"]')
    if (!textarea)
      return
    const onStart = () => { isComposingRef.current = true }
    const onEnd = () => {
      isComposingRef.current = false
      if (compositionQueueRef.current) {
        const text = compositionQueueRef.current
        compositionQueueRef.current = ''
        baseTextRef.current += text
        controller.textInput.setInput(baseTextRef.current)
      }
    }
    textarea.addEventListener('compositionstart', onStart)
    textarea.addEventListener('compositionend', onEnd)
    return () => {
      textarea.removeEventListener('compositionstart', onStart)
      textarea.removeEventListener('compositionend', onEnd)
    }
  }, [controller])

  // Inline draft: show partial transcript appended to base text inside the textarea.
  useEffect(() => {
    if (voiceState === 'idle')
      return
    controller.textInput.setInput(baseTextRef.current + draftText)
  }, [draftText, voiceState, controller])

  // Confirmed: lock in final text, clear the draft portion.
  useEffect(() => {
    if (pendingConfirmed === null)
      return
    if (isComposingRef.current) {
      compositionQueueRef.current += pendingConfirmed
    }
    else {
      baseTextRef.current += pendingConfirmed
      controller.textInput.setInput(baseTextRef.current)
    }
    onConfirmedFlushed()
  }, [pendingConfirmed, controller, onConfirmedFlushed])

  // Cancel: restore textarea to its pre-recording state.
  useEffect(() => {
    if (!restoreBase)
      return
    controller.textInput.setInput(baseTextRef.current)
    onRestoreHandled()
  }, [restoreBase, controller, onRestoreHandled])

  return <span ref={anchorRef} className="hidden" aria-hidden="true" />
}
