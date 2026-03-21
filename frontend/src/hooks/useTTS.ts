import type { ShadowLearnDB } from '@/db'
import type { DecryptedKeys } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getTTSCache, saveTTSCache } from '@/db'
import { API_BASE, getAppConfig } from '@/lib/config'

// Sentinel: undefined = not yet fetched, string = resolved provider name
type ProviderState = string | null

interface UseTTSReturn {
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export function useTTS(
  db: ShadowLearnDB | null,
  keys: DecryptedKeys | null,
  trialMode: boolean = false,
): UseTTSReturn {
  const [loadingText, setLoadingText] = useState<string | null>(null)
  // providerRef always holds the latest value — avoids stale closure in playTTS
  const providerRef = useRef<ProviderState>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const dbRef = useRef(db)
  const keysRef = useRef(keys)
  const trialModeRef = useRef(trialMode)

  // Keep refs in sync with props
  useEffect(() => {
    dbRef.current = db
  }, [db])
  useEffect(() => {
    keysRef.current = keys
  }, [keys])
  useEffect(() => {
    trialModeRef.current = trialMode
  }, [trialMode])

  // Fetch the active provider once on mount
  useEffect(() => {
    getAppConfig().then((cfg) => {
      providerRef.current = cfg.ttsProvider
    })
  }, [])

  const playTTS = useCallback(async (text: string) => {
    if (!text)
      return

    // No-op while provider is still loading — use ref for current value
    const currentProvider = providerRef.current
    if (currentProvider === null)
      return

    const currentKeys = keysRef.current

    // Key validation per provider — skip in trial mode (backend provides fallback keys)
    if (!trialModeRef.current) {
      if (currentProvider === 'azure') {
        if (!currentKeys?.azureSpeechKey || !currentKeys?.azureSpeechRegion) {
          toast.error('Add your Azure Speech key in Settings to use pronunciation')
          return
        }
      }
      else if (currentProvider === 'minimax') {
        if (!currentKeys?.minimaxApiKey) {
          toast.error('Add your MiniMax API key in Settings to use pronunciation')
          return
        }
      }
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

    const currentDb = dbRef.current

    try {
      let blob: Blob | undefined

      if (currentDb) {
        blob = await getTTSCache(currentDb, text)
      }

      if (!blob) {
        // Build request body based on active provider
        const body: Record<string, string> = { text }
        if (currentProvider === 'azure') {
          body.azure_speech_key = currentKeys?.azureSpeechKey ?? ''
          body.azure_speech_region = currentKeys?.azureSpeechRegion ?? ''
        }
        else if (currentProvider === 'minimax') {
          body.minimax_api_key = currentKeys?.minimaxApiKey ?? ''
        }

        const response = await fetch(`${API_BASE}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          throw new Error(`TTS failed: ${response.statusText}`)
        }

        blob = await response.blob()

        if (currentDb) {
          await saveTTSCache(currentDb, text, blob)
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
      audio.play().catch(() => {})
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
