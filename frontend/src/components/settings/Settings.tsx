import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { decryptKeys, encryptKeys } from '@/crypto'
import { getCryptoData, getSettings, saveCryptoData, saveSettings } from '@/db'
import { getAppConfig } from '@/lib/config'
import { LANGUAGES } from '@/lib/constants'
import type { Locale } from '@/lib/i18n'

export function Settings() {
  const { db, keys, lock, resetKeys, setup } = useAuth()
  const { locale, setLocale, t } = useI18n()

  const [provider, setProvider] = useState<string | null>(null)
  const [sttProvider, setSttProvider] = useState<string>('deepgram')
  const [language, setLanguage] = useState('en')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editOpenrouterKey, setEditOpenrouterKey] = useState(keys?.openrouterApiKey ?? '')
  const [editMinimaxKey, setEditMinimaxKey] = useState(keys?.minimaxApiKey ?? '')
  const [editDeepgramKey, setEditDeepgramKey] = useState(keys?.deepgramApiKey ?? '')
  const [editAzureSpeechKey, setEditAzureSpeechKey] = useState(keys?.azureSpeechKey ?? '')
  const [editAzureSpeechRegion, setEditAzureSpeechRegion] = useState(keys?.azureSpeechRegion ?? '')
  const [keysPin, setKeysPin] = useState('')
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)

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
        setLanguage(s.translationLanguage)
      }
    })
  }, [db])

  // Sync edit fields when keys load (setState-during-render pattern — avoids effect setter)
  const [prevKeys, setPrevKeys] = useState(keys)
  if (prevKeys !== keys) {
    setPrevKeys(keys)
    setEditOpenrouterKey(keys?.openrouterApiKey ?? '')
    setEditMinimaxKey(keys?.minimaxApiKey ?? '')
    setEditDeepgramKey(keys?.deepgramApiKey ?? '')
    setEditAzureSpeechKey(keys?.azureSpeechKey ?? '')
    setEditAzureSpeechRegion(keys?.azureSpeechRegion ?? '')
  }

  async function handleSaveKeys() {
    setKeysError(null)
    if (!keysPin) {
      setKeysError('Enter your PIN to save key changes')
      return
    }
    if (!editOpenrouterKey.trim()) {
      setKeysError('OpenRouter API key cannot be empty')
      return
    }
    if (provider === 'azure') {
      if (!editAzureSpeechKey.trim() || !editAzureSpeechRegion.trim()) {
        setKeysError('Azure Speech key and region are required')
        return
      }
    }
    if (provider === 'minimax') {
      if (!editMinimaxKey.trim()) {
        setKeysError('MiniMax API key is required')
        return
      }
    }
    if (!db)
      return
    try {
      const cryptoData = await getCryptoData(db)
      if (!cryptoData)
        throw new Error('No stored keys found')
      await decryptKeys(cryptoData, keysPin)

      const newKeys = {
        openrouterApiKey: editOpenrouterKey.trim(),
        minimaxApiKey: editMinimaxKey.trim() || undefined,
        deepgramApiKey: editDeepgramKey.trim() || undefined,
        azureSpeechKey: editAzureSpeechKey.trim() || undefined,
        azureSpeechRegion: editAzureSpeechRegion.trim() || undefined,
      }
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
      setPinError('PIN must be at least 4 characters')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match')
      return
    }

    try {
      const encrypted = await encryptKeys(keys, newPin)
      await saveCryptoData(db, encrypted)
      setNewPin('')
      setConfirmPin('')
      setPinSuccess(true)
      toast.success('PIN changed successfully')
    }
    catch {
      setPinError('Failed to change PIN')
      toast.error('Failed to change PIN')
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
              <span className="text-sm text-white/40">{t('settings.visibility')}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowKeys(!showKeys)}>
                {showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/40">{t('settings.openrouterKey')}</label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editOpenrouterKey}
                onChange={e => setEditOpenrouterKey(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Azure TTS + pronunciation keys — shown when provider is azure (or loading) */}
            {(provider === null || provider === 'azure') && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-white/40">
                    {t('settings.azureSpeechKey')}
                    {' '}
                    <span className="text-white/20">(for TTS and pronunciation assessment)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechKey}
                    onChange={e => setEditAzureSpeechKey(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="Paste your Azure Speech key"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/40">
                    {t('settings.azureSpeechRegion')}
                    {' '}
                    <span className="text-white/20">(e.g. eastus)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechRegion}
                    onChange={e => setEditAzureSpeechRegion(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="e.g. eastus"
                  />
                </div>
              </>
            )}

            {/* MiniMax key — shown only when provider is minimax */}
            {provider === 'minimax' && (
              <div className="space-y-2">
                <label className="text-sm text-white/40">
                  {t('settings.minimaxKey')}
                  {' '}
                  <span className="text-white/20">(for listening practice)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editMinimaxKey}
                  onChange={e => setEditMinimaxKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Leave blank to disable TTS"
                />
              </div>
            )}

            {sttProvider === 'deepgram' && (
              <div className="space-y-2">
                <label className="text-sm text-white/40">
                  {t('settings.deepgramKey')}
                  {' '}
                  <span className="text-white/20">(for video subtitles)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editDeepgramKey}
                  onChange={e => setEditDeepgramKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="dg-..."
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-white/40">{t('settings.confirmWithPin')}</label>
              <Input
                type="password"
                value={keysPin}
                onChange={e => setKeysPin(e.target.value)}
                placeholder="Enter your PIN to save"
              />
            </div>
            {keysError && <p className="text-sm text-destructive">{keysError}</p>}
            {keysSaved && <p className="text-sm text-emerald-400">Keys saved</p>}
            <Button onClick={handleSaveKeys} disabled={provider === null}>{t('settings.saveKeys')}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.changePin')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-white/40">{t('settings.newPin')}</label>
              <Input
                type="password"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="Enter new PIN"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/40">{t('settings.confirmPin')}</label>
              <Input
                type="password"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="Confirm new PIN"
              />
            </div>
            {pinError && <p className="text-sm text-destructive">{pinError}</p>}
            {pinSuccess && <p className="text-sm text-emerald-400">PIN changed successfully</p>}
            <div className="flex gap-2">
              <Button onClick={handleChangePin} size="sm">Change PIN</Button>
              <Button variant="destructive" size="sm" onClick={resetKeys}>
                Forgot PIN
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-white/40">{t('settings.translationLanguage')}</label>
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
              <Label>{t('settings.interfaceLanguage')}</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as Locale)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vi">Tiếng Việt</SelectItem>
                  <SelectItem value="en">English</SelectItem>
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
