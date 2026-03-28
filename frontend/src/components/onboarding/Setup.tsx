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
          openrouterApiKey: openrouterApiKey.trim() || undefined,
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

  const formReady = pin.length >= 4 && pin === pinConfirm

  return (
    <div className="h-screen overflow-y-auto bg-[oklch(0.08_0_0)] px-4">
      <div className="min-h-full flex items-center justify-center py-10">
        <div className="flex w-full max-w-md flex-col gap-3">
          {freeTrialAvailable && (
            <Card className="mb-5 bg-white/6 text-white/90">
              <CardContent className="flex flex-col gap-3 ">
                <div>
                  <p className="text-lg font-medium">{t('auth.trial.title')}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t('auth.trial.hint')}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={startTrial} className="w-full mt-3">
                  {t('auth.trial.button')}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white/6 text-white/90">
            <CardHeader>
              <CardTitle className="text-xl">{t('auth.welcome')}</CardTitle>
              <CardDescription className="text-muted-foreground">
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
                    placeholder={t('auth.placeholder.optionalKey')}
                    value={openrouterApiKey}
                    onChange={e => setOpenrouterApiKey(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
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
                      placeholder={t('auth.placeholder.optionalKey')}
                      value={deepgramApiKey}
                      onChange={e => setDeepgramApiKey(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
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
                        placeholder={t('auth.placeholder.optionalKey')}
                        value={azureSpeechKey}
                        onChange={e => setAzureSpeechKey(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground">
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
                        placeholder={t('auth.placeholder.azureRegion')}
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
                      placeholder={t('auth.placeholder.optionalKey')}
                      value={minimaxApiKey}
                      onChange={e => setMinimaxApiKey(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
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

                <Button type="submit" disabled={loading || !formReady} className="mt-1">
                  {loading ? t('auth.settingUp') : t('auth.getStarted')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
