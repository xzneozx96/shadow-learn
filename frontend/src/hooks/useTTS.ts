import type { ShadowLearnDB } from '@/db'
import type { DecryptedKeys } from '@/types'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getTTSCache, saveTTSCache } from '@/db'

interface UseTTSReturn {
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export function useTTS(
  db: ShadowLearnDB | null,
  keys: DecryptedKeys | null,
): UseTTSReturn {
  const [loadingText, setLoadingText] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const playTTS = useCallback(async (text: string) => {
    if (!text)
      return

    if (!keys?.minimaxApiKey) {
      toast.error('Add your Minimax API key in Settings to use pronunciation')
      return
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }

    setLoadingText(text)

    try {
      let blob: Blob | undefined

      if (db) {
        blob = await getTTSCache(db, text)
      }

      if (!blob) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, minimax_api_key: keys.minimaxApiKey }),
        })

        if (!response.ok) {
          throw new Error(`TTS failed: ${response.statusText}`)
        }

        blob = await response.blob()

        if (db) {
          await saveTTSCache(db, text, blob)
        }
      }

      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio

      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url)
        urlRef.current = null
      })
      // Intentionally not awaited: play() returns a Promise but we want loadingText
      // cleared as soon as playback starts (in finally), not when it finishes.
      // The 'ended' listener handles cleanup.
      audio.play().catch(() => {}) // suppress unhandled rejection if browser blocks autoplay
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Pronunciation failed'
      toast.error(msg)
    }
    finally {
      setLoadingText(null)
    }
  }, [db, keys])

  return { playTTS, loadingText }
}
