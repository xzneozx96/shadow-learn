import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { decryptKeys, encryptKeys } from '@/crypto'
import { getCryptoData, getSettings, saveCryptoData, saveSettings } from '@/db'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
]

export function Settings() {
  const { db, keys, lock, resetKeys, setup } = useAuth()

  const [language, setLanguage] = useState('en')
  const [model, setModel] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editOpenaiKey, setEditOpenaiKey] = useState(keys?.openaiApiKey ?? '')
  const [editMinimaxKey, setEditMinimaxKey] = useState(keys?.minimaxApiKey ?? '')
  const [keysPin, setKeysPin] = useState('')
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s) {
        setLanguage(s.translationLanguage)
        setModel(s.defaultModel)
      }
    })
  }, [db])

  useEffect(() => {
    setEditOpenaiKey(keys?.openaiApiKey ?? '')
    setEditMinimaxKey(keys?.minimaxApiKey ?? '')
  }, [keys])

  async function handleSaveKeys() {
    setKeysError(null)
    if (!keysPin) {
      setKeysError('Enter your PIN to save key changes')
      return
    }
    if (!editOpenaiKey.trim()) {
      setKeysError('OpenAI API key cannot be empty')
      return
    }
    if (!db)
      return
    try {
      // Verify PIN is correct before re-encrypting
      const cryptoData = await getCryptoData(db)
      if (!cryptoData)
        throw new Error('No stored keys found')
      await decryptKeys(cryptoData, keysPin) // throws if PIN is wrong

      const newKeys = {
        openaiApiKey: editOpenaiKey.trim(),
        minimaxApiKey: editMinimaxKey.trim() || undefined,
      }
      await setup(newKeys, keysPin)
      setKeysSaved(true)
      setKeysPin('')
      toast.success('API keys updated')
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
    await saveSettings(db, {
      translationLanguage: language,
      defaultModel: model,
    })
    setSaved(true)
    toast.success('Settings saved')
    setTimeout(setSaved, 2000, false)
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-xl font-bold">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Visibility</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowKeys(!showKeys)}>
                {showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">OpenAI API Key</label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editOpenaiKey}
                onChange={e => setEditOpenaiKey(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">
                Minimax API Key
                {' '}
                <span className="text-slate-600">(for pronunciation)</span>
              </label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editMinimaxKey}
                onChange={e => setEditMinimaxKey(e.target.value)}
                className="font-mono text-xs"
                placeholder="Leave blank to disable TTS"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Confirm with PIN</label>
              <Input
                type="password"
                value={keysPin}
                onChange={e => setKeysPin(e.target.value)}
                placeholder="Enter your PIN to save"
              />
            </div>
            {keysError && <p className="text-sm text-destructive">{keysError}</p>}
            {keysSaved && <p className="text-sm text-emerald-400">Keys saved</p>}
            <Button size="sm" onClick={handleSaveKeys}>Save Keys</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change PIN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs text-slate-400">New PIN</label>
              <Input
                type="password"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="Enter new PIN"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Confirm PIN</label>
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
            <CardTitle>Language</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Translation Language</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)}>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Default Model</label>
              <Input
                placeholder="e.g. gpt-4o-mini"
                value={model}
                onChange={e => setModel(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSaveSettings}>
            <Save className="size-4" />
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
          <Button variant="outline" onClick={lock}>
            <Lock className="size-4" />
            Lock App
          </Button>
        </div>
      </div>
    </Layout>
  )
}
