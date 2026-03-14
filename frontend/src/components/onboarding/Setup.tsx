import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export function Setup() {
  const { setup } = useAuth()

  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('')
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!elevenlabsApiKey.trim()) {
      setError('ElevenLabs API key is required.')
      return
    }
    if (!openrouterApiKey.trim()) {
      setError('OpenRouter API key is required.')
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
        { elevenlabsApiKey: elevenlabsApiKey.trim(), openrouterApiKey: openrouterApiKey.trim() },
        pin,
      )
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.')
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-md bg-slate-800 text-slate-100">
        <CardHeader>
          <CardTitle className="text-xl">Welcome to ShadowLearn</CardTitle>
          <CardDescription className="text-slate-400">
            Enter your API keys to get started. They will be encrypted with your PIN and stored
            locally in your browser -- nothing leaves this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="elevenlabs" className="text-sm font-medium text-slate-300">
                ElevenLabs API Key
              </label>
              <Input
                id="elevenlabs"
                type="password"
                placeholder="sk_..."
                value={elevenlabsApiKey}
                onChange={e => setElevenlabsApiKey(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="openrouter" className="text-sm font-medium text-slate-300">
                OpenRouter API Key
              </label>
              <Input
                id="openrouter"
                type="password"
                placeholder="sk-or-..."
                value={openrouterApiKey}
                onChange={e => setOpenrouterApiKey(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin" className="text-sm font-medium text-slate-300">
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
              <label htmlFor="pin-confirm" className="text-sm font-medium text-slate-300">
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
