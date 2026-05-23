import type { GeneratedSituation } from '../types'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/shared/lib/config'
import { Button } from '@/shared/ui/button'

export interface CustomSituationInputProps {
  language: string
  level: 'beginner' | 'intermediate' | 'advanced'
  personaId: string
  onGenerated: (situation: GeneratedSituation) => void
  onCancel: () => void
}

export function CustomSituationInput({ language, level, personaId, onGenerated, onCancel }: CustomSituationInputProps) {
  const { keys } = useAuth()
  const { t, locale } = useI18n()
  const hasGoogleKey = !!(keys?.googleRealtimeKey)

  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!hasGoogleKey) {
      setError(t('auth.error.googleRequired'))
      return
    }
    if (text.trim().length < 10) {
      setError(t('speak.customScene.minLength'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${API_BASE}/api/speak/situations/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_text: text.trim(),
          language,
          level,
          google_key: keys.googleRealtimeKey,
          persona_id: personaId,
          interface_language: locale,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail ?? t('speak.customScene.generationFailed'))
      }
      const data = await resp.json() as GeneratedSituation
      onGenerated(data)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{t('speak.customScene.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('speak.customScene.example')}</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t('speak.customScene.placeholder')}
        className="w-full min-h-[100px] border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 bg-card text-foreground"
        disabled={loading}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="lg"
          onClick={onCancel}
          disabled={loading}
        >
          {t('common.cancel')}
        </Button>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={loading || text.trim().length < 10}
        >
          {loading ? t('speak.customScene.generating') : t('speak.customScene.create')}
        </Button>
      </div>
    </div>
  )
}
