import type { AddResult, RegisterInput } from '@/hooks/useUserMaterials'
import type { InstructionLanguage, Skill } from '@/types/collection'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/contexts/I18nContext'
import { parseYouTubeUrl } from '@/lib/youtubeUrl'

const SKILLS: Skill[] = ['Grammar', 'Pronunciation', 'Vocabulary', 'Speaking', 'Learning Tips']
const LANGS: InstructionLanguage[] = ['English', 'Vietnamese', 'Chinese']

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (input: RegisterInput) => Promise<AddResult>
}

export function RegisterMaterialModal({ open, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [skill, setSkill] = useState<Skill>('Grammar')
  const [lang, setLang] = useState<InstructionLanguage>('English')
  const [submitting, setSubmitting] = useState(false)

  const parsed = useMemo(() => parseYouTubeUrl(url), [url])
  const canSubmit = parsed !== null && !submitting

  const reset = () => {
    setUrl('')
    setName('')
    setSkill('Grammar')
    setLang('English')
    setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting)
      return
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!parsed)
      return
    setSubmitting(true)
    const result = await onSubmit({
      source: parsed.kind,
      externalId: parsed.id,
      name,
      skill,
      instructionLanguage: lang,
    })
    setSubmitting(false)
    if (result.ok) {
      toast.success(t('collection.toast.registered'))
      reset()
      onClose()
      return
    }
    if (result.reason === 'duplicate')
      toast.error(t('collection.toast.duplicate'))
    else if (result.reason === 'fetch-failed')
      toast.error(t('collection.toast.fetchFailed'))
    else
      toast.error(t('collection.toast.unknownError'))
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('collection.registerModal.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="url">{t('collection.registerModal.urlLabel')}</Label>
            <Input
              id="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=… or https://youtu.be/…"
            />
            {url && !parsed && (
              <p className="text-xs text-destructive">{t('collection.registerModal.urlInvalid')}</p>
            )}
            {parsed && (
              <p className="text-xs text-muted-foreground">
                {parsed.kind === 'playlist'
                  ? t('collection.registerModal.detectedPlaylist')
                  : t('collection.registerModal.detectedVideo')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{t('collection.registerModal.nameLabel')}</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('collection.registerModal.namePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('collection.registerModal.nameHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t('collection.registerModal.skillLabel')}</Label>
            <Select value={skill} onValueChange={v => setSkill(v as Skill)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SKILLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('collection.registerModal.langLabel')}</Label>
            <Select value={lang} onValueChange={v => setLang(v as InstructionLanguage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? t('collection.registerModal.submitting') : t('collection.registerModal.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
