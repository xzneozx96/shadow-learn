import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAudioRecorderOptions {
  minDurationMs?: number
}

export interface UseAudioRecorderReturn {
  recordingState: 'idle' | 'recording' | 'processing' | 'stopped'
  blob: Blob | null
  isPlaying: boolean
  attempt: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancel: () => void
  togglePlayback: () => void
  reset: () => void
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const { minDurationMs = 0 } = options

  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing' | 'stopped'>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const cancelledRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function revokeUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      try {
        recorderRef.current?.stop()
      }
      catch { /* already stopped */ }
      stopStream()
      revokeUrl()
      audioRef.current?.pause()
    }
  }, [])

  const startRecording = useCallback(async () => {
    revokeUrl()
    stopStream()
    cancelledRef.current = false
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stopStream()
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        const duration = Date.now() - startTimeRef.current
        if (duration < minDurationMs) {
          setRecordingState('idle')
          return
        }
        const b = new Blob(chunksRef.current, { type: 'audio/webm' })
        objectUrlRef.current = URL.createObjectURL(b)
        setBlob(b)
        setRecordingState('stopped')
      }

      recorder.start()
      startTimeRef.current = Date.now()
      setAttempt(a => a + 1)
      setRecordingState('recording')
    }
    catch {
      // Mic access denied — stay idle
    }
  }, [minDurationMs])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    recorderRef.current = null
    setRecordingState('processing')
    recorder?.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder) {
      recorderRef.current = null
      try {
        recorder.stop()
      }
      catch { /* already stopped */ }
    }
    stopStream()
    setRecordingState('idle')
  }, [])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause()
      audioRef.current = null
      setIsPlaying(false)
      return
    }
    if (!objectUrlRef.current)
      return
    const audio = new Audio(objectUrlRef.current)
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => {
      setIsPlaying(false)
      audioRef.current = null
    }
    audio.onpause = () => setIsPlaying(false)
    audio.play().catch(() => {})
  }, [isPlaying])

  const reset = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    revokeUrl()
    setBlob(null)
    setIsPlaying(false)
    setRecordingState('idle')
  }, [])

  return { recordingState, blob, isPlaying, attempt, startRecording, stopRecording, cancel, togglePlayback, reset }
}
