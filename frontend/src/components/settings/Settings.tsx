import type { Locale } from '@/lib/i18n'
import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { decryptKeys, encryptKeys } from '@/crypto'
import { getCryptoData, getSettings, saveCryptoData, saveSettings } from '@/db'
import { getAppConfig } from '@/lib/config'
import { INTERFACE_LANGUAGES, LANGUAGES } from '@/lib/constants'

export function Settings() {
  const { db, keys, lock, resetKeys, setup, trialMode } = useAuth()
  const { locale, setLocale, t } = useI18n()

  const [provider, setProvider] = useState<string | null>(null)
  const [sttProvider, setSttProvider] = useState<string>('deepgram')
  const [language, setLanguage] = useState<string>(locale)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editOpenrouterKey, setEditOpenrouterKey] = useState(keys?.openrouterApiKey ?? '')
  const [editMinimaxKey, setEditMinimaxKey] = useState(keys?.minimaxApiKey ?? '')
  const [editDeepgramKey, setEditDeepgramKey] = useState(keys?.deepgramApiKey ?? '')
  const [editGladiaKey, setEditGladiaKey] = useState(keys?.gladiaApiKey ?? '')
  const [editAzureSpeechKey, setEditAzureSpeechKey] = useState(keys?.azureSpeechKey ?? '')
  const [editAzureSpeechRegion, setEditAzureSpeechRegion] = useState(keys?.azureSpeechRegion ?? '')
  const [keysPin, setKeysPin] = useState('')
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [newTrialPin, setNewTrialPin] = useState('')
  const [newTrialPinConfirm, setNewTrialPinConfirm] = useState('')

  useEffect(() => {
    getAppConfig().then((cfg) => {
      setProvider(cfg.ttsProvider)
      setSttProvider(cfg.sttProvider)
    })
  }, [])

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s) {
        setLanguage(s.translationLanguage || locale)
      }
    })
  }, [db, locale])

  // Sync edit fields when keys load (setState-during-render pattern — avoids effect setter)
  const [prevKeys, setPrevKeys] = useState(keys)
  if (prevKeys !== keys) {
    setPrevKeys(keys)
    setEditOpenrouterKey(keys?.openrouterApiKey ?? '')
    setEditMinimaxKey(keys?.minimaxApiKey ?? '')
    setEditDeepgramKey(keys?.deepgramApiKey ?? '')
    setEditGladiaKey(keys?.gladiaApiKey ?? '')
    setEditAzureSpeechKey(keys?.azureSpeechKey ?? '')
    setEditAzureSpeechRegion(keys?.azureSpeechRegion ?? '')
  }

  async function handleSaveKeys() {
    setKeysError(null)

    const newKeys = {
      openrouterApiKey: editOpenrouterKey.trim() || undefined,
      minimaxApiKey: editMinimaxKey.trim() || undefined,
      deepgramApiKey: editDeepgramKey.trim() || undefined,
      gladiaApiKey: editGladiaKey.trim() || undefined,
      azureSpeechKey: editAzureSpeechKey.trim() || undefined,
      azureSpeechRegion: editAzureSpeechRegion.trim() || undefined,
    }

    if (trialMode) {
      // Trial path: create a new PIN (no existing one to verify)
      if (newTrialPin.length < 4) {
        setKeysError('PIN must be at least 4 digits')
        return
      }
      if (newTrialPin !== newTrialPinConfirm) {
        setKeysError('PINs do not match')
        return
      }
      if (!db) {
        setKeysError('Database not ready')
        return
      }
      try {
        await setup(newKeys, newTrialPin)
        setNewTrialPin('')
        setNewTrialPinConfirm('')
        setKeysSaved(true)
        toast.success(t('settings.keysSaved'))
        setTimeout(setKeysSaved, 2000, false)
      }
      catch {
        setKeysError('Failed to save API keys')
        toast.error('Failed to save API keys')
      }
      return
    }

    // Own-keys path: verify existing PIN before saving
    if (!keysPin) {
      setKeysError('Enter your PIN to save key changes')
      return
    }
    if (!db)
      return
    try {
      const cryptoData = await getCryptoData(db)
      if (!cryptoData)
        throw new Error('No stored keys found')
      await decryptKeys(cryptoData, keysPin) // PIN verification — result intentionally discarded; no separate verifyPin() exists
      await setup(newKeys, keysPin)
      setKeysSaved(true)
      setKeysPin('')
      toast.success(t('settings.keysSaved'))
      setTimeout(setKeysSaved, 2000, false)
    }
    catch {
      setKeysError('Incorrect PIN or save failed')
      toast.error('Failed to save API keys')
    }
  }

  async function handleChangePin() {
    if (!db || !keys)
      return
    setPinError(null)
    setPinSuccess(false)

    if (newPin.length < 4) {
      setPinError(t('settings.pinTooShort'))
      return
    }
    if (newPin !== confirmPin) {
      setPinError(t('settings.pinMismatch'))
      return
    }

    try {
      const encrypted = await encryptKeys(keys, newPin)
      await saveCryptoData(db, encrypted)
      setNewPin('')
      setConfirmPin('')
      setPinSuccess(true)
      toast.success(t('settings.pinChanged'))
    }
    catch {
      setPinError(t('settings.pinChangeFailed'))
      toast.error(t('settings.pinChangeFailed'))
    }
  }

  async function handleSaveSettings() {
    if (!db)
      return
    const current = await getSettings(db)
    await saveSettings(db, {
      ...(current ?? { translationLanguage: '' }),
      translationLanguage: language,
    })
    setSaved(true)
    toast.success(t('settings.saved'))
    setTimeout(setSaved, 2000, false)
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-xl font-bold">{t('settings.title')}</h1>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.apiKeys')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('settings.visibility')}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowKeys(!showKeys)}>
                {showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('settings.openrouterKey')}</label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editOpenrouterKey}
                onChange={e => setEditOpenrouterKey(e.target.value)}
                className="font-mono text-sm"
                placeholder={t('auth.placeholder.optionalKey')}
              />
            </div>

            {/* Azure TTS + pronunciation keys — shown when provider is azure (or loading) */}
            {(provider === null || provider === 'azure') && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    {t('settings.azureSpeechKey')}
                    {' '}
                    <span className="text-white/20">(for TTS and pronunciation assessment)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechKey}
                    onChange={e => setEditAzureSpeechKey(e.target.value)}
                    className="font-mono text-sm"
                    placeholder={t('auth.placeholder.optionalKey')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    {t('settings.azureSpeechRegion')}
                    {' '}
                    <span className="text-white/20">(e.g. eastus)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechRegion}
                    onChange={e => setEditAzureSpeechRegion(e.target.value)}
                    className="font-mono text-sm"
                    placeholder={t('auth.placeholder.azureRegion')}
                  />
                </div>
              </>
            )}

            {/* MiniMax key — shown only when provider is minimax */}
            {provider === 'minimax' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('settings.minimaxKey')}
                  {' '}
                  <span className="text-white/20">(for listening practice)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editMinimaxKey}
                  onChange={e => setEditMinimaxKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder={t('auth.placeholder.optionalKey')}
                />
              </div>
            )}

            {sttProvider === 'deepgram' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('settings.deepgramKey')}
                  {' '}
                  <span className="text-white/20">(for video subtitles)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editDeepgramKey}
                  onChange={e => setEditDeepgramKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder={t('auth.placeholder.optionalKey')}
                />
              </div>
            )}
            {sttProvider === 'gladia' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {t('settings.gladiaKey')}
                  {' '}
                  <span className="text-white/20">(for video transcription)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editGladiaKey}
                  onChange={e => setEditGladiaKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder={t('auth.placeholder.optionalKey')}
                />
              </div>
            )}
            {trialMode
              ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Create a PIN</label>
                      <Input
                        type="password"
                        value={newTrialPin}
                        onChange={e => setNewTrialPin(e.target.value)}
                        placeholder="4+ digits"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Confirm PIN</label>
                      <Input
                        type="password"
                        value={newTrialPinConfirm}
                        onChange={e => setNewTrialPinConfirm(e.target.value)}
                        placeholder="Repeat your PIN"
                      />
                    </div>
                  </>
                )
              : (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">{t('settings.confirmWithPin')}</label>
                    <Input
                      type="password"
                      value={keysPin}
                      onChange={e => setKeysPin(e.target.value)}
                      placeholder="Enter your PIN to save"
                    />
                  </div>
                )}
            {keysError && <p className="text-sm text-destructive">{keysError}</p>}
            {keysSaved && <p className="text-sm text-emerald-400">Keys saved</p>}
            <Button onClick={handleSaveKeys} disabled={provider === null}>{t('settings.saveKeys')}</Button>
          </CardContent>
        </Card>

        {!trialMode && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.changePin')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t('settings.newPin')}</label>
                <Input
                  type="password"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  placeholder={t('settings.newPinPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t('settings.confirmPin')}</label>
                <Input
                  type="password"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                  placeholder={t('settings.confirmPinPlaceholder')}
                />
              </div>
              {pinError && <p className="text-sm text-destructive">{pinError}</p>}
              {pinSuccess && <p className="text-sm text-emerald-400">{t('settings.pinChanged')}</p>}
              <div className="flex gap-2">
                <Button onClick={handleChangePin} size="sm">{t('settings.changePin')}</Button>
                <Button variant="destructive" size="sm" onClick={resetKeys}>
                  {t('settings.forgotPin')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('settings.translationLanguage')}</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('settings.interfaceLanguage')}</label>
              <Select
                value={locale}
                onValueChange={v => setLocale(v as Locale)}
                items={INTERFACE_LANGUAGES}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERFACE_LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSaveSettings}>
            <Save className="size-4" />
            {saved ? t('settings.saved') : t('settings.saveSettings')}
          </Button>
          <Button variant="outline" onClick={lock}>
            <Lock className="size-4" />
            {t('settings.lockApp')}
          </Button>

        </div>
      </div>
    </Layout>
  )
}
