import { useI18n } from '@/contexts/I18nContext'
import { Input } from '@/shared/ui/input'

interface YouTubeTabProps {
  url: string
  onUrlChange: (url: string) => void
}

export function YouTubeTab({ url, onUrlChange }: YouTubeTabProps) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.youtubeUrl')}</label>
      <Input
        placeholder={t('create.youtubeUrlPlaceholder')}
        value={url}
        onChange={e => onUrlChange(e.target.value)}
        data-testid="create-lesson-youtube-url-input"
      />
    </div>
  )
}
