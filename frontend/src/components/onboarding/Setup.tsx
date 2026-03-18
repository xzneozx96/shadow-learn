import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { getAppConfig } from '@/lib/config'

export function Setup() {
  const { setup } = useAuth()

  const [provider, setProvider] = useState<string | null>(null)
  const [sttProvider, setSttProvider] = useState<string>('deepgram')
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [minimaxApiKey, setMinimaxApiKey] = useState('')
  const [deepgramApiKey, setDeepgramApiKey] = useState('')
  const [azureSpeechKey, setAzureSpeechKey] = useState('')
  const [azureSpeechRegion, setAzureSpeechRegion] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAppConfig().then((cfg) => {
      setProvider(cfg.ttsProvider)
      setSttProvider(cfg.sttProvider)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!openrouterApiKey.trim()) {
      setError('OpenRouter API key is required.')
      return
    }
    if (sttProvider === 'deepgram' && !deepgramApiKey.trim()) {
      setError('Deepgram API key is required.')
      return
    }
    if (provider === 'azure') {
      if (!azureSpeechKey.trim() || !azureSpeechRegion.trim()) {
        setError('Azure Speech key and region are required for pronunciation.')
        return
      }
    }
    if (provider === 'minimax') {
      if (!minimaxApiKey.trim()) {
        setError('MiniMax API key is required for pronunciation.')
        return
      }
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
          openrouterApiKey: openrouterApiKey.trim(),
          minimaxApiKey: minimaxApiKey.trim() || undefined,
          deepgramApiKey: deepgramApiKey.trim() || undefined,
          azureSpeechKey: azureSpeechKey.trim() || undefined,
          azureSpeechRegion: azureSpeechRegion.trim() || undefined,
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
      <Card className="w-full max-w-md bg-white/6 text-white/90">
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
                OpenRouter API Key
              </label>
              <Input
                id="openai"
                type="password"
                placeholder="sk-..."
                value={openrouterApiKey}
                onChange={e => setOpenrouterApiKey(e.target.value)}
              />
              <p className="text-sm text-white/30">
                Used for translation and AI chat.
              </p>
            </div>

            {sttProvider === 'deepgram' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="deepgram" className="text-sm font-medium text-white/65">
                  Deepgram API Key
                </label>
                <Input
                  id="deepgram"
                  type="password"
                  placeholder="dg-..."
                  value={deepgramApiKey}
                  onChange={e => setDeepgramApiKey(e.target.value)}
                />
                <p className="text-sm text-white/30">
                  Used for transcription. Required to create lessons.
                </p>
              </div>
            )}

            {/* Azure TTS fields — shown when provider is 'azure' (or still loading, as safe default) */}
            {(provider === null || provider === 'azure') && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="azure-speech-key" className="text-sm font-medium text-white/65">
                    Azure Speech Key
                  </label>
                  <Input
                    id="azure-speech-key"
                    type="password"
                    placeholder="Paste your Azure Speech key…"
                    value={azureSpeechKey}
                    onChange={e => setAzureSpeechKey(e.target.value)}
                  />
                  <p className="text-sm text-white/30">
                    Used for word and sentence pronunciation (TTS) and pronunciation assessment.
                    Free tier: 500K characters/month.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="azure-speech-region" className="text-sm font-medium text-white/65">
                    Azure Speech Region
                  </label>
                  <Input
                    id="azure-speech-region"
                    type="text"
                    placeholder="e.g. eastus"
                    value={azureSpeechRegion}
                    onChange={e => setAzureSpeechRegion(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* MiniMax TTS field — shown only when provider is 'minimax' */}
            {provider === 'minimax' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minimax" className="text-sm font-medium text-white/65">
                  Minimax API Key
                </label>
                <Input
                  id="minimax"
                  type="password"
                  placeholder="eyJ..."
                  value={minimaxApiKey}
                  onChange={e => setMinimaxApiKey(e.target.value)}
                />
                <p className="text-sm text-white/30">
                  Used for word and sentence pronunciation (TTS).
                </p>
              </div>
            )}

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

            <Button type="submit" disabled={loading || provider === null} className="mt-1">
              {loading ? 'Setting up...' : 'Get Started'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
