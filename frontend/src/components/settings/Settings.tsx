import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { encryptKeys } from '@/crypto'
import { getSettings, saveCryptoData, saveSettings } from '@/db'

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

function maskKey(key: string): string {
  if (key.length <= 4)
    return '****'
  return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`
}

export function Settings() {
  const { db, keys, lock, resetKeys } = useAuth()

  const [language, setLanguage] = useState('en')
  const [model, setModel] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)

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
    }
    catch {
      setPinError('Failed to change PIN')
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
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">OpenRouter API Key</label>
              <Input
                readOnly
                value={showKeys ? (keys?.openrouterApiKey ?? '') : maskKey(keys?.openrouterApiKey ?? '')}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">ElevenLabs API Key</label>
              <Input
                readOnly
                value={showKeys ? (keys?.elevenlabsApiKey ?? '') : maskKey(keys?.elevenlabsApiKey ?? '')}
                className="font-mono text-xs"
              />
            </div>
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
              <Select value={language} onValueChange={setLanguage}>
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
                placeholder="e.g. openai/gpt-4o"
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
