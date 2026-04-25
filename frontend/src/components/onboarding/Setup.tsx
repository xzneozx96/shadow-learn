import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getAppConfig } from '@/lib/config'
import { INTERFACE_LANGUAGES } from '@/lib/constants'

export function Setup() {
  const { setup, startTrial } = useAuth()
  const { locale, setLocale, t } = useI18n()

  const [freeTrialAvailable, setFreeTrialAvailable] = useState(false)
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAppConfig().then((cfg) => {
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
          googleRealtimeKey: geminiApiKey.trim() || undefined,
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
    <div className="h-screen overflow-y-auto px-4">
      <div className="flex justify-center pt-10">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          {INTERFACE_LANGUAGES.map(lang => (
            <button
              key={lang.value}
              type="button"
              onClick={() => setLocale(lang.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                locale === lang.value
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center py-6 mt-10">
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
                <Button type="button" variant="default" onClick={startTrial} className="w-full mt-3">
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

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gemini" className="text-sm font-medium text-white/65">
                    {t('auth.googleRealtimeKey')}
                  </label>
                  <Input
                    id="gemini"
                    type="password"
                    placeholder={t('auth.placeholder.optionalKey')}
                    value={geminiApiKey}
                    onChange={e => setGeminiApiKey(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('auth.setup.geminiHint')}
                  </p>
                </div>

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
