import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export interface GeneratedSituation {
  situation_id: string
  title: string
  user_goal: string
}

export interface CustomSituationInputProps {
  language: string
  level: 'beginner' | 'intermediate' | 'advanced'
  onGenerated: (situation: GeneratedSituation) => void
  onCancel: () => void
}

export function CustomSituationInput({ language, level, onGenerated, onCancel }: CustomSituationInputProps) {
  const { keys } = useAuth()
  const openrouterKey = keys?.openrouterApiKey
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!openrouterKey) {
      setError('OpenRouter API key not configured.')
      return
    }
    if (text.trim().length < 10) {
      setError('Please describe the scene in at least 10 characters.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/speak/situations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_text: text.trim(),
          language,
          level,
          openrouter_key: openrouterKey,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail ?? 'Generation failed. Please rephrase.')
      }
      const data = await resp.json() as GeneratedSituation
      onGenerated(data)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Describe your scene</h3>
      <p className="text-sm text-muted-foreground">
        e.g. &ldquo;Arguing with my landlord about a broken heater&rdquo;
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What do you want to practice?"
        className="w-full min-h-[100px] border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground"
        disabled={loading}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || text.trim().length < 10}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Preparing your scene…' : 'Create scene'}
        </button>
      </div>
    </div>
  )
}
