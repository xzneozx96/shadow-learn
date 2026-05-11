import { Input } from '@/components/ui/input'
import { useI18n } from '@/contexts/I18nContext'

interface BlogTabProps {
  url: string
  onUrlChange: (url: string) => void
}

export function BlogTab({ url, onUrlChange }: BlogTabProps) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-white/65">{t('create.blogUrl')}</label>
      <Input
        placeholder={t('create.blogUrlPlaceholder')}
        value={url}
        onChange={e => onUrlChange(e.target.value)}
        data-testid="create-lesson-blog-url-input"
      />
    </div>
  )
}
