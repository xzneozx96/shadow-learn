import type { InstructionLanguage, Skill } from '@/types/collection'
import { ListPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/contexts/I18nContext'
import { useUserMaterials } from '@/hooks/useUserMaterials'
import { parseYouTubeUrl } from '@/lib/youtubeUrl'

const SKILLS: Skill[] = ['Grammar', 'Pronunciation', 'Vocabulary', 'Speaking', 'Learning Tips']
const LANGS: InstructionLanguage[] = ['English', 'Vietnamese', 'Chinese']

export function RegisterMaterialPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { add } = useUserMaterials()

  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [skill, setSkill] = useState<Skill>('Grammar')
  const [lang, setLang] = useState<InstructionLanguage>('English')
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => parseYouTubeUrl(url), [url])
  const canSubmit = parsed !== null && !submitting

  const reset = () => {
    setUrl('')
    setName('')
    setSkill('Grammar')
    setLang('English')
    setError(null)
  }

  const handleSubmit = async () => {
    if (!parsed)
      return
    setSubmitting(true)
    setError(null)
    const result = await add({
      source: parsed.kind,
      externalId: parsed.id,
      name,
      skill,
      instructionLanguage: lang,
    })
    setSubmitting(false)
    if (result.ok) {
      toast.success(t('collection.toast.registered'))
      setRegistered(true)
      return
    }
    if (result.reason === 'duplicate')
      setError(t('collection.toast.duplicate'))
    else if (result.reason === 'fetch-failed')
      setError(t('collection.toast.fetchFailed'))
    else
      setError(t('collection.toast.unknownError'))
  }

  if (registered) {
    return (
      <Layout>
        <div className="relative z-5 mx-auto max-w-2xl p-4 pt-60">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {t('collection.toast.registered')}
              </p>
              <div className="flex gap-2">
                <Button size="lg" onClick={() => { reset(); setRegistered(false) }}>
                  {t('collection.registerPage.registerAnother')}
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigate('/collection?tab=mine')}>
                  {t('collection.registerPage.goToMine')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="relative z-5 mx-auto max-w-2xl p-4 pt-60">
        <Card>
          <CardHeader>
            <CardTitle>{t('collection.registerModal.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-foreground/60 pl-2">{t('collection.registerModal.urlLabel')}</Label>
              <Input
                id="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=… or https://youtu.be/…"
              />
              {url && !parsed && (
                <p className="pl-2 text-xs text-destructive italic">{t('collection.registerModal.urlInvalid')}</p>
              )}
              {parsed && (
                <p className="pl-2 text-xs text-amber-500 italic">
                  {parsed.kind === 'playlist'
                    ? t('collection.registerModal.detectedPlaylist')
                    : t('collection.registerModal.detectedVideo')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground/60 pl-2">{t('collection.registerModal.nameLabel')}</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('collection.registerModal.namePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('collection.registerModal.nameHint')}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground/60 pl-2">{t('collection.registerModal.skillLabel')}</Label>
              <Select value={skill} onValueChange={v => v !== null && setSkill(v as Skill)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SKILLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground/60 pl-2">{t('collection.registerModal.langLabel')}</Label>
              <Select value={lang} onValueChange={v => v !== null && setLang(v as InstructionLanguage)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="w-full"
              size="lg"
            >
              <ListPlus className="size-4" />
              {submitting ? t('collection.registerModal.submitting') : t('collection.registerModal.submit')}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
