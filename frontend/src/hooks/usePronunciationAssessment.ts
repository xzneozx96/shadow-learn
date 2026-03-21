import type { PronunciationAssessResult } from '@/types'
import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { API_BASE } from '@/lib/config'

interface UsePronunciationAssessmentReturn {
  submit: (blob: Blob, sentence: string, language?: string) => Promise<void>
  result: PronunciationAssessResult | null
  submitting: boolean
  error: string | null
  reset: () => void
}

export function usePronunciationAssessment(): UsePronunciationAssessmentReturn {
  const { keys } = useAuth()
  const [result, setResult] = useState<PronunciationAssessResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(async (blob: Blob, sentence: string, language = 'zh-CN') => {
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      form.append('reference_text', sentence)
      form.append('language', language)
      if (keys?.azureSpeechKey)
        form.append('azure_key', keys.azureSpeechKey)
      if (keys?.azureSpeechRegion)
        form.append('azure_region', keys.azureSpeechRegion)
      const resp = await fetch(`${API_BASE}/api/pronunciation/assess`, { method: 'POST', body: form })
      if (!resp.ok)
        throw new Error(await resp.text())
      setResult(await resp.json())
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    }
    finally {
      setSubmitting(false)
    }
  }, [keys])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { submit, result, submitting, error, reset }
}
