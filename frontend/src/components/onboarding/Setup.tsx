import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getAppConfig } from '@/lib/config'

export function Setup() {
  const { setup, startTrial } = useAuth()
  const { t } = useI18n()

  const [provider, setProvider] = useState<string | null>(null)
  const [sttProvider, setSttProvider] = useState<string>('deepgram')
  const [freeTrialAvailable, setFreeTrialAvailable] = useState(false)
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
      setFreeTrialAvailable(cfg.freeTrialAvailable)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!openrouterApiKey.trim()) {
      setError(t('auth.error.openrouterRequired'))
      return
    }
    if (sttProvider === 'deepgram' && !deepgramApiKey.trim()) {
      setError(t('auth.error.deepgramRequired'))
      return
    }
    if (provider === 'azure') {
      if (!azureSpeechKey.trim() || !azureSpeechRegion.trim()) {
        setError(t('auth.error.azureRequired'))
        return
      }
    }
    if (provider === 'minimax') {
      if (!minimaxApiKey.trim()) {
        setError(t('auth.error.minimaxRequired'))
        return
      }
    }
    if (pin.length < 4) {
      setError(t('auth.error.pinTooShort'))
      return
    }
    if (pin !== pinConfirm) {
      setError(t('auth.error.pinMismatch'))
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
      const msg = err instanceof Error ? err.message : t('auth.error.setupFailed')
      setError(msg)
      toast.error(msg)
    }
    finally {
      setLoading(false)
    }
  }

  const formReady
    = !!openrouterApiKey.trim()
      && pin.length >= 4
      && pin === pinConfirm
      && (sttProvider !== 'deepgram' || !!deepgramApiKey.trim())
      && (provider !== 'azure' || (!!azureSpeechKey.trim() && !!azureSpeechRegion.trim()))
      && (provider !== 'minimax' || !!minimaxApiKey.trim())

  return (
    <div className="flex h-screen items-center justify-center bg-[oklch(0.08_0_0)] px-4">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Card className="bg-white/6 text-white/90">
          <CardHeader>
            <CardTitle className="text-xl">{t('auth.welcome')}</CardTitle>
            <CardDescription className="text-white/40">
              {t('auth.setup.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="openai" className="text-sm font-medium text-white/65">
                  {t('auth.openrouterKey')}
                </label>
                <Input
                  id="openai"
                  type="password"
                  placeholder="sk-..."
                  value={openrouterApiKey}
                  onChange={e => setOpenrouterApiKey(e.target.value)}
                />
                <p className="text-sm text-white/30">
                  {t('auth.setup.openrouterHint')}
                </p>
              </div>

              {sttProvider === 'deepgram' && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="deepgram" className="text-sm font-medium text-white/65">
                    {t('auth.deepgramKey')}
                  </label>
                  <Input
                    id="deepgram"
                    type="password"
                    placeholder="dg-..."
                    value={deepgramApiKey}
                    onChange={e => setDeepgramApiKey(e.target.value)}
                  />
                  <p className="text-sm text-white/30">
                    {t('auth.setup.deepgramHint')}
                  </p>
                </div>
              )}

              {/* Azure TTS fields — shown when provider is 'azure' (or still loading, as safe default) */}
              {(provider === null || provider === 'azure') && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="azure-speech-key" className="text-sm font-medium text-white/65">
                      {t('auth.azureSpeechKey')}
                    </label>
                    <Input
                      id="azure-speech-key"
                      type="password"
                      placeholder="Paste your Azure Speech key…"
                      value={azureSpeechKey}
                      onChange={e => setAzureSpeechKey(e.target.value)}
                    />
                    <p className="text-sm text-white/30">
                      {t('auth.setup.azureHint')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="azure-speech-region" className="text-sm font-medium text-white/65">
                      {t('auth.azureSpeechRegion')}
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
                    {t('auth.minimaxKey')}
                  </label>
                  <Input
                    id="minimax"
                    type="password"
                    placeholder="eyJ..."
                    value={minimaxApiKey}
                    onChange={e => setMinimaxApiKey(e.target.value)}
                  />
                  <p className="text-sm text-white/30">
                    {t('auth.setup.minimaxHint')}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="pin" className="text-sm font-medium text-white/65">
                  {t('auth.pin')}
                </label>
                <Input
                  id="pin"
                  type="password"
                  placeholder={t('auth.pinEnterPlaceholder')}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="pin-confirm" className="text-sm font-medium text-white/65">
                  {t('auth.confirmPin')}
                </label>
                <Input
                  id="pin-confirm"
                  type="password"
                  placeholder={t('auth.pinConfirmPlaceholder')}
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <Button type="submit" disabled={loading || provider === null || !formReady} className="mt-1">
                {loading ? t('auth.settingUp') : t('auth.getStarted')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {freeTrialAvailable && (
          <Card className="bg-white/6 text-white/90">
            <CardContent className="flex flex-col gap-3 pt-5">
              <div>
                <p className="text-sm font-medium">Try for free</p>
                <p className="mt-0.5 text-xs text-white/40">
                  Uses shared API keys. May be discontinued when costs become unsustainable — add your own keys in Settings anytime.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={startTrial} className="w-full">
                Start free trial
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
