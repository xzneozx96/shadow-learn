import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { VoiceSelector } from '@/components/voice/VoiceSelector'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'
import { MINIMAX_VOICES } from '@/lib/voices'

interface BlogTabProps {
  url: string
  onUrlChange: (url: string) => void
  text: string
  onTextChange: (text: string) => void
  title: string
  onTitleChange: (title: string) => void
  voiceId: string
  onVoiceChange: (id: string) => void
}

type BlogMode = 'url' | 'text'

export function BlogTab({ url, onUrlChange, text, onTextChange, title, onTitleChange, voiceId, onVoiceChange }: BlogTabProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<BlogMode>('url')

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-border p-0.5 w-fit">
        {(['url', 'text'] as BlogMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150',
              mode === m
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m === 'url' ? t('create.blogUrl') : t('create.blogPasteText')}
          </button>
        ))}
      </div>

      {mode === 'url'
        ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.blogUrl')}</label>
              <Input
                placeholder={t('create.blogUrlPlaceholder')}
                value={url}
                onChange={e => onUrlChange(e.target.value)}
                data-testid="create-lesson-blog-url-input"
              />
            </div>
          )
        : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.blogTextTitle')}</label>
                <Input
                  placeholder={t('create.blogTextTitlePlaceholder')}
                  value={title}
                  onChange={e => onTitleChange(e.target.value)}
                  data-testid="create-lesson-blog-title-input"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.blogPasteText')}</label>
                <textarea
                  placeholder={t('create.blogTextPlaceholder')}
                  value={text}
                  onChange={e => onTextChange(e.target.value.slice(0, 2000))}
                  data-testid="create-lesson-blog-text-input"
                  rows={8}
                  maxLength={2000}
                  className="w-full rounded-md border border-input bg-input/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 resize-none"
                />
                <p className={cn(
                  'text-right text-xs tabular-nums transition-colors duration-150',
                  text.length >= 1800 ? 'text-destructive' : 'text-muted-foreground',
                )}
                >
                  {text.length.toLocaleString()}
                  {' / 2,000'}
                </p>
              </div>
            </div>
          )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground/60 pl-2">Narrator Voice</label>
        <VoiceSelector voices={MINIMAX_VOICES} selectedId={voiceId} onSelect={onVoiceChange} />
      </div>
    </div>
  )
}
