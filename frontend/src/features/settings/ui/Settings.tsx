import type { Provider, ProviderKeyState } from '@/features/settings/api/keys'
import type { Locale, TranslationKey } from '@/shared/lib/i18n'
import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/app/Layout'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { getSettings, saveSettings } from '@/db'
import { listKeys, removeKey, saveKey } from '@/features/settings/api/keys'
import { VoiceSelector } from '@/features/settings/ui/VoiceSelector'
import { INTERFACE_LANGUAGES, LANGUAGES } from '@/shared/lib/constants'
import { DEFAULT_VOICE_ID, MINIMAX_VOICES } from '@/shared/lib/voices'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const PROVIDER_LABELS: Record<Provider, TranslationKey> = {
  openrouter: 'settings.provider.openrouter',
  azure_speech: 'settings.provider.azureSpeech',
  google: 'settings.provider.google',
}

function ProviderKeyRow({ state, onSaved, onRemoved }: {
  state: ProviderKeyState
  onSaved: (next: ProviderKeyState) => void
  onRemoved: () => Promise<void>
}) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [region, setRegion] = useState(state.region ?? '')
  const [busy, setBusy] = useState(false)
  const needsRegion = state.provider === 'azure_speech'

  async function handleSave() {
    setBusy(true)
    try {
      onSaved(await saveKey(state.provider, value.trim(), needsRegion ? region.trim() : null))
      setValue('')
      toast.success(t('settings.keysSaved'))
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.failedToSaveKeys'))
    }
    finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      await removeKey(state.provider)
      await onRemoved()
      toast.success(t('settings.keyRemoved'))
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.failedToRemoveKey'))
    }
    finally {
      setBusy(false)
    }
  }

  const status = state.source === 'user'
    ? state.last4 === null ? t('settings.keyStatus.unreadable') : t('settings.keyStatus.user', { last4: state.last4 })
    : state.source === 'env'
      ? t('settings.keyStatus.env')
      : t('settings.keyStatus.none')

  return (
    <div className="space-y-2" data-testid={`provider-key-${state.provider}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor={`key-${state.provider}`}>{t(PROVIDER_LABELS[state.provider])}</label>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
      <div className="flex gap-2">
        <Input
          id={`key-${state.provider}`}
          type="password"
          autoComplete="off"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="font-mono text-sm"
          placeholder={t('settings.keyPlaceholder')}
        />
        {needsRegion && (
          <Input
            aria-label={t('settings.azureSpeechRegion')}
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="w-32 text-sm"
            placeholder="eastus"
          />
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={busy || !value.trim() || (needsRegion && !region.trim())}>
          {t('settings.saveKey')}
        </Button>
        {state.source === 'user' && (
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={busy}>
            {t('settings.removeKey')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ProviderKeysCard() {
  const { t } = useI18n()
  const [states, setStates] = useState<ProviderKeyState[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    listKeys().then(setStates, () => setLoadFailed(true))
  }, [])

  function replace(next: ProviderKeyState) {
    setStates(prev => prev?.map(s => s.provider === next.provider ? next : s) ?? null)
  }

  async function reload() {
    setStates(await listKeys())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.providerKeys')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadFailed && <p className="text-sm text-destructive">{t('settings.failedToLoadKeys')}</p>}
        {states?.map(state => (
          <ProviderKeyRow key={state.provider} state={state} onSaved={replace} onRemoved={reload} />
        ))}
      </CardContent>
    </Card>
  )
}

export function Settings() {
  const { db } = useAuth()
  const { locale, setLocale, t } = useI18n()

  const [language, setLanguage] = useState<string>(locale)
  const [saved, setSaved] = useState(false)
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)

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
      <div className="h-full overflow-y-auto">
        <div className="relative z-5 mx-auto max-w-2xl space-y-6 p-4 pt-10 pb-10">
          <ProviderKeysCard />

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

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t('settings.narratorVoice')}</label>
                <VoiceSelector voices={MINIMAX_VOICES} selectedId={voiceId} onSelect={setVoiceId} />
              </div>

              <Button size="lg" onClick={handleSaveSettings} className="w-full mt-6">
                <Save className="size-4" />
                {saved ? t('settings.saved') : t('settings.saveSettings')}
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </Layout>
  )
}
