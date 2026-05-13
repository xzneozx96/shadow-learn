import type { Locale } from '@/lib/i18n'
import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VoiceSelector } from '@/components/voice/VoiceSelector'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { getCryptoData, getSettings, saveCryptoData, saveSettings } from '@/db'
import { INTERFACE_LANGUAGES, LANGUAGES } from '@/lib/constants'
import { decryptKeys, encryptKeys } from '@/lib/crypto'
import { DEFAULT_VOICE_ID, MINIMAX_VOICES } from '@/lib/voices'

export function Settings() {
  const { db, keys, lock, resetKeys, setup, trialMode } = useAuth()
  const { locale, setLocale, t } = useI18n()

  const [language, setLanguage] = useState<string>(locale)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)
  const [editOpenrouterKey, setEditOpenrouterKey] = useState(keys?.openrouterApiKey ?? '')
  const [editGeminiKey, setEditGeminiKey] = useState(keys?.googleRealtimeKey ?? '')
  const [keysPin, setKeysPin] = useState('')
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [newTrialPin, setNewTrialPin] = useState('')
  const [newTrialPinConfirm, setNewTrialPinConfirm] = useState('')

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s) {
        setLanguage(s.translationLanguage || locale)
        if (s.minimaxVoiceId)
          setVoiceId(s.minimaxVoiceId)
      }
    })
  }, [db, locale])

  // Sync edit fields when keys load (setState-during-render pattern — avoids effect setter)
  const [prevKeys, setPrevKeys] = useState(keys)
  if (prevKeys !== keys) {
    setPrevKeys(keys)
    setEditOpenrouterKey(keys?.openrouterApiKey ?? '')
    setEditGeminiKey(keys?.googleRealtimeKey ?? '')
  }

  async function handleSaveKeys() {
    setKeysError(null)

    const newKeys = {
      openrouterApiKey: editOpenrouterKey.trim() || undefined,
      googleRealtimeKey: editGeminiKey.trim() || undefined,
    }

    if (trialMode) {
      // Trial path: create a new PIN (no existing one to verify)
      if (newTrialPin.length < 4) {
        setKeysError(t('settings.pinMinDigits'))
        return
      }
      if (newTrialPin !== newTrialPinConfirm) {
        setKeysError(t('settings.pinDoNotMatch'))
        return
      }
      if (!db) {
        setKeysError(t('settings.databaseNotReady'))
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
        setKeysError(t('settings.failedToSaveKeys'))
        toast.error(t('settings.failedToSaveKeys'))
      }
      return
    }

    // Own-keys path: verify existing PIN before saving
    if (!keysPin) {
      setKeysError(t('settings.enterPinToSaveChanges'))
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
      setKeysError(t('settings.incorrectPinOrFailed'))
      toast.error(t('settings.failedToSaveKeys'))
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
      minimaxVoiceId: voiceId,
    })
    setSaved(true)
    toast.success(t('settings.saved'))
    setTimeout(setSaved, 2000, false)
  }

  return (
    <Layout>
      <div className="relative z-5 mx-auto max-w-2xl space-y-6 p-4 pt-10">
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

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                {t('auth.googleRealtimeKey')}
              </label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editGeminiKey}
                onChange={e => setEditGeminiKey(e.target.value)}
                className="font-mono text-sm"
                placeholder={t('auth.placeholder.optionalKey')}
              />
            </div>

            {trialMode
              ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">{t('settings.createPin')}</label>
                      <Input
                        type="password"
                        value={newTrialPin}
                        onChange={e => setNewTrialPin(e.target.value)}
                        placeholder={t('settings.pinDigits')}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">{t('settings.confirmPinShort')}</label>
                      <Input
                        type="password"
                        value={newTrialPinConfirm}
                        onChange={e => setNewTrialPinConfirm(e.target.value)}
                        placeholder={t('settings.repeatPin')}
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
                      placeholder={t('settings.enterPinToSave')}
                    />
                  </div>
                )}
            {keysError && <p className="text-sm text-destructive">{keysError}</p>}
            {keysSaved && <p className="text-sm text-emerald-400">{t('settings.keysSavedSuccess')}</p>}

            <Button className="w-full mt-4" size="lg" onClick={handleSaveKeys}>{t('settings.saveKeys')}</Button>
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
              <div className="flex gap-2 mt-6">
                <Button className="flex-1" onClick={handleChangePin} size="lg">{t('settings.changePin')}</Button>
                <Button className="flex-1" variant="destructive" size="lg" onClick={resetKeys}>
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

            <div className="flex gap-3 mt-6">
              <Button size="lg" onClick={handleSaveSettings} className="flex-1">
                <Save className="size-4" />
                {saved ? t('settings.saved') : t('settings.saveSettings')}
              </Button>
              <Button variant="outline" size="lg" onClick={lock} className="flex-1">
                <Lock className="size-4" />
                {t('settings.lockApp')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Narrator Voice</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Default voice for blog lesson narration and vocabulary pronunciation.
            </p>
            <VoiceSelector voices={MINIMAX_VOICES} selectedId={voiceId} onSelect={setVoiceId} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
