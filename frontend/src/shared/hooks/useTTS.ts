import type { ShadowLearnDB } from '@/db'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getTTSCache, saveTTSCache } from '@/db'
import { apiFetch, responseError } from '@/shared/lib/api'

interface UseTTSReturn {
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export function useTTS(
  db: ShadowLearnDB | null,
  language: string = 'zh-CN',
  voiceId?: string,
): UseTTSReturn {
  const [loadingText, setLoadingText] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const dbRef = useRef(db)
  const languageRef = useRef(language)
  const voiceIdRef = useRef(voiceId)

  // Keep refs in sync with props
  useEffect(() => {
    dbRef.current = db
  }, [db])
  useEffect(() => {
    languageRef.current = language
  }, [language])
  useEffect(() => {
    voiceIdRef.current = voiceId
  }, [voiceId])

  const playTTS = useCallback(async (text: string) => {
    if (!text)
      return

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

    const currentDb = dbRef.current
    const currentLanguage = languageRef.current

    try {
      let blob: Blob | undefined

      if (currentDb) {
        blob = await getTTSCache(currentDb, text, currentLanguage)
      }

      if (!blob) {
        const body: Record<string, string> = { text, source_language: currentLanguage }
        if (voiceIdRef.current) {
          body.minimax_voice_id = voiceIdRef.current
        }

        const response = await apiFetch(`/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          throw await responseError(response, `TTS failed: ${response.statusText}`)
        }

        blob = await response.blob()

        if (currentDb) {
          await saveTTSCache(currentDb, text, blob, currentLanguage)
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
      audio.play()?.catch(() => {})
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Pronunciation failed'
      toast.error(msg)
    }
    finally {
      setLoadingText(null)
    }
  }, []) // stable callback — reads all state from refs

  return { playTTS, loadingText }
}
