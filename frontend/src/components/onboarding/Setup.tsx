import type { FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getAppConfig } from '@/shared/lib/config'
import { INTERFACE_LANGUAGES } from '@/shared/lib/constants'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'

const SPRING = [0.16, 1, 0.3, 1] as const

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
  const [shakeKey, setShakeKey] = useState(0)

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
      setShakeKey(k => k + 1)
      return
    }
    if (pin !== pinConfirm) {
      setError(t('auth.error.pinMismatch'))
      setShakeKey(k => k + 1)
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
      setShakeKey(k => k + 1)
      toast.error(msg)
    }
    finally {
      setLoading(false)
    }
  }

  const formReady = pin.length >= 4 && pin === pinConfirm

  return (
    <div className="h-screen overflow-y-auto px-4">
      {/* Language switcher */}
      <motion.div
        className="flex justify-center pt-10"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: SPRING }}
      >
        <div className="relative flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          {INTERFACE_LANGUAGES.map(lang => (
            <button
              key={lang.value}
              type="button"
              onClick={() => setLocale(lang.value)}
              className="relative rounded-full px-3 py-1 text-sm font-medium transition-colors z-10"
              style={{ color: locale === lang.value ? 'white' : 'rgba(255,255,255,0.4)' }}
            >
              {locale === lang.value && (
                <motion.span
                  layoutId="lang-pill"
                  className="absolute inset-0 rounded-full bg-white/15"
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                />
              )}
              <span className="relative">{lang.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      <div className="flex items-center justify-center py-6 mt-10">
        <div className="flex w-full max-w-md flex-col gap-3">
          {/* Logo */}
          <motion.div
            className="mb-2 flex items-center gap-3 px-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: SPRING, delay: 0.05 }}
          >
            <img src="/favicon.svg" alt="ShadowLearn" className="size-8" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">ShadowLearn</h1>
          </motion.div>

          {/* Trial card */}
          {freeTrialAvailable && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: SPRING, delay: 0.1 }}
            >
              <Card className="mb-5 bg-white/6 text-white/90">
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <p className="text-lg font-medium">{t('auth.trial.title')}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t('auth.trial.hint')}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    type="button"
                    variant="default"
                    onClick={startTrial}
                    className="w-full mt-3 active:scale-[0.97] transition-transform"
                  >
                    {t('auth.trial.button')}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Setup card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: SPRING, delay: freeTrialAvailable ? 0.15 : 0.1 }}
          >
            <Card className="bg-white/6 text-white/90">
              <CardHeader>
                <CardTitle className="text-xl">{t('auth.welcome')}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {t('auth.setup.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* shakeKey forces re-mount to replay the shake keyframe */}
                <form
                  key={shakeKey}
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4"
                  style={shakeKey > 0 ? { animation: 'shake 0.4s ease both' } : undefined}
                >
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
                    <p className="text-sm text-muted-foreground">
                      {t('auth.setup.pinHint')}
                    </p>
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

                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.p
                        key={error}
                        className="text-sm text-red-400"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <Button
                    size="lg"
                    type="submit"
                    disabled={loading || !formReady}
                    className="mt-1 active:scale-[0.97] transition-transform"
                  >
                    {loading ? t('auth.settingUp') : t('auth.getStarted')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
