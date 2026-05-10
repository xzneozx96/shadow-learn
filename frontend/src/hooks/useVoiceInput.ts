import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/lib/config'

export type VoiceInputState = 'idle' | 'connecting' | 'recording' | 'processing'

export interface UseVoiceInputArgs {
  onDraft: (text: string) => void
  onConfirmed: (text: string) => void
  onCancel?: () => void
}

export interface UseVoiceInputReturn {
  state: VoiceInputState
  error: string | null
  start: () => void
  stop: () => void
  cancel: () => void
  cleanup: () => void
}

const MAX_BURST_MS = 30_000
const PROCESSING_SAFETY_MS = 2_000
const WORKLET_URL = '/pcm-encoder.worklet.js'

interface GladiaTranscriptMessage {
  type: 'transcript'
  data: {
    is_final: boolean
    utterance: { text: string }
  }
}

export function useVoiceInput({ onDraft, onConfirmed, onCancel }: UseVoiceInputArgs): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const burstTimerRef = useRef<number | null>(null)
  const processingTimerRef = useRef<number | null>(null)
  const pendingAutoStartRef = useRef(false)
  const stateRef = useRef<VoiceInputState>('idle')
  const isAwaitingFinalRef = useRef(false)
  // When true, suppress is_final → onConfirmed for the current burst (cancel).
  const discardFinalsRef = useRef(false)

  // Keep latest callbacks accessible inside long-lived listeners.
  const onDraftRef = useRef(onDraft)
  const onConfirmedRef = useRef(onConfirmed)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onDraftRef.current = onDraft
    onConfirmedRef.current = onConfirmed
    onCancelRef.current = onCancel
  }, [onDraft, onConfirmed, onCancel])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const stopAudioCapture = useCallback(() => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current)
      burstTimerRef.current = null
    }
    try {
      sourceNodeRef.current?.disconnect()
      workletNodeRef.current?.disconnect()
    }
    catch {
      // Already disconnected.
    }
    sourceNodeRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const transitionToIdle = useCallback(() => {
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current)
      processingTimerRef.current = null
    }
    isAwaitingFinalRef.current = false
    setState('idle')
  }, [])

  const handleGladiaMessage = useCallback((event: MessageEvent) => {
    if (typeof event.data !== 'string') {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(event.data)
    }
    catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      return
    }
    const msg = parsed as Partial<GladiaTranscriptMessage>
    if (msg.type !== 'transcript' || !msg.data) {
      return
    }
    const text = msg.data.utterance?.text ?? ''
    if (!text) {
      return
    }
    if (msg.data.is_final) {
      if (!discardFinalsRef.current) {
        onConfirmedRef.current(`${text} `)
      }
      if (isAwaitingFinalRef.current) {
        discardFinalsRef.current = false
        transitionToIdle()
      }
    }
    else if (!discardFinalsRef.current) {
      onDraftRef.current(text)
    }
  }, [transitionToIdle])

  const beginCapture = useCallback(async () => {
    // Reset finals-suppression so a previous cancel() doesn't silently drop this burst's
    // partials/finals. cancel() sets discardFinalsRef=true and never resets it because the
    // normal reset path only fires on is_final while isAwaitingFinalRef is true (stop path).
    discardFinalsRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      let ctx = audioContextRef.current
      if (!ctx) {
        ctx = new AudioContext()
        await ctx.audioWorklet.addModule(WORKLET_URL)
        audioContextRef.current = ctx
      }
      // User-gesture chain: safe to resume.
      await ctx.resume()

      const source = ctx.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      const node = new AudioWorkletNode(ctx, 'pcm-encoder')
      workletNodeRef.current = node
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      source.connect(node)
      // Worklet has no audible output; do NOT connect to ctx.destination.

      setState('recording')
      burstTimerRef.current = window.setTimeout(() => {
        setError('voice.maxReached')
        // eslint-disable-next-line ts/no-use-before-define
        stopAndAwaitFinal()
      }, MAX_BURST_MS)
    }
    catch (err) {
      stopAudioCapture()
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'voice.permissionDenied'
        : 'voice.unavailable'
      setError(msg)
      setState('idle')
    }
  }, [stopAudioCapture])

  const ensureSession = useCallback(async () => {
    const url = `${API_BASE}/api/transcription/session`
    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) {
      throw new Error(`session http ${response.status}`)
    }
    const data = (await response.json()) as { url: string }
    const ws = new WebSocket(data.url)
    ws.binaryType = 'arraybuffer'
    ws.onmessage = handleGladiaMessage
    ws.onclose = () => {
      const wasRecording = stateRef.current === 'recording' || pendingAutoStartRef.current
      wsRef.current = null
      if (wasRecording) {
        stopAudioCapture()
        setError('voice.connectionLost')
        transitionToIdle()
      }
    }
    wsRef.current = ws
    return new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.onerror = null
        if (pendingAutoStartRef.current) {
          pendingAutoStartRef.current = false
          beginCapture()
        }
        resolve()
      }
      ws.onerror = () => reject(new Error('ws open failed'))
    })
  }, [handleGladiaMessage, beginCapture, stopAudioCapture, transitionToIdle])

  const stopAndAwaitFinal = useCallback(() => {
    stopAudioCapture()
    isAwaitingFinalRef.current = true
    setState('processing')
    processingTimerRef.current = window.setTimeout(() => {
      transitionToIdle()
    }, PROCESSING_SAFETY_MS)
  }, [stopAudioCapture, transitionToIdle])

  const start = useCallback(() => {
    setError(null)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      beginCapture()
      return
    }
    pendingAutoStartRef.current = true
    setState('connecting')
    ensureSession().catch(() => {
      pendingAutoStartRef.current = false
      setError('voice.unavailable')
      setState('idle')
    })
  }, [beginCapture, ensureSession])

  const stop = useCallback(() => {
    stopAndAwaitFinal()
  }, [stopAndAwaitFinal])

  const cancel = useCallback(() => {
    // Discard the current burst entirely: no draft flush, no final flush.
    discardFinalsRef.current = true
    stopAudioCapture()
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current)
      processingTimerRef.current = null
    }
    isAwaitingFinalRef.current = false
    onCancelRef.current?.()
    setState('idle')
  }, [stopAudioCapture])

  const isMountedRef = useRef(true)

  const tearDown = useCallback(() => {
    stopAudioCapture()
    if (processingTimerRef.current !== null) {
      window.clearTimeout(processingTimerRef.current)
      processingTimerRef.current = null
    }
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'stop_recording' }))
      }
      catch {
        // best-effort
      }
      ws.close()
    }
    wsRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    workletNodeRef.current = null
    pendingAutoStartRef.current = false
    isAwaitingFinalRef.current = false
  }, [stopAudioCapture])

  const cleanup = useCallback(() => {
    tearDown()
    if (isMountedRef.current) {
      setState('idle')
    }
  }, [tearDown])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      tearDown()
    }
    // tearDown ref is stable; we want this to run only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, error, start, stop, cancel, cleanup }
}
