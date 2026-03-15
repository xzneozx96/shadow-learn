import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export function Setup() {
  const { setup } = useAuth()

  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [minimaxApiKey, setMinimaxApiKey] = useState('')
  const [deepgramApiKey, setDeepgramApiKey] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!openaiApiKey.trim()) {
      setError('OpenAI API key is required.')
      return
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 characters.')
      return
    }
    if (pin !== pinConfirm) {
      setError('PINs do not match.')
      return
    }

    try {
      setLoading(true)
      await setup(
        {
          openaiApiKey: openaiApiKey.trim(),
          minimaxApiKey: minimaxApiKey.trim() || undefined,
          deepgramApiKey: deepgramApiKey.trim() || undefined,
        },
        pin,
      )
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup failed.'
      setError(msg)
      toast.error(msg)
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[oklch(0.08_0_0)] px-4">
      <Card className="w-full max-w-md bg-white/[0.06] text-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Welcome to ShadowLearn</CardTitle>
          <CardDescription className="text-white/40">
            Enter your API keys to get started. They will be encrypted with your PIN and stored
            locally in your browser — nothing leaves this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="openai" className="text-sm font-medium text-white/65">
                OpenAI API Key
              </label>
              <Input
                id="openai"
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={e => setOpenaiApiKey(e.target.value)}
              />
              <p className="text-xs text-white/30">
                Used for transcription (Whisper), translation, and AI chat.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="minimax" className="text-sm font-medium text-white/65">
                {'Minimax API Key '}
                <span className="text-white/30">(optional)</span>
              </label>
              <Input
                id="minimax"
                type="password"
                placeholder="eyJ..."
                value={minimaxApiKey}
                onChange={e => setMinimaxApiKey(e.target.value)}
              />
              <p className="text-xs text-white/30">
                Used for word and sentence pronunciation (TTS). Can be added later in Settings.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="deepgram" className="text-sm font-medium text-white/65">
                Deepgram API Key{' '}
                <span className="text-white/30">(optional)</span>
              </label>
              <Input
                id="deepgram"
                type="password"
                placeholder="..."
                value={deepgramApiKey}
                onChange={e => setDeepgramApiKey(e.target.value)}
              />
              <p className="text-xs text-white/30">
                Used for transcription (faster, more accurate than Whisper). Can be added later in Settings.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin" className="text-sm font-medium text-white/65">
                PIN (4+ characters)
              </label>
              <Input
                id="pin"
                type="password"
                placeholder="Enter a PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin-confirm" className="text-sm font-medium text-white/65">
                Confirm PIN
              </label>
              <Input
                id="pin-confirm"
                type="password"
                placeholder="Re-enter your PIN"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? 'Setting up...' : 'Get Started'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
