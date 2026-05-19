import type { TipNote } from '@/types/tips'
import { Layers, MessageSquare, MoreVertical, PenLine, Sparkles, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/contexts/I18nContext'
import { htmlToPlain } from '@/lib/htmlText'

interface Props {
  note: TipNote
  onOpen: (id: string) => void
  onDiscuss: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}

function relativeTime(iso: string, locale: string, justNowLabel: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.round((then - now) / 1000)
  const absSec = Math.abs(diffSec)
  // Under 60s collapses to a static label — avoids per-second ticking on re-render.
  if (absSec < 60)
    return justNowLabel
  const rtf = new Intl.RelativeTimeFormat(locale === 'vi' ? 'vi' : 'en', { numeric: 'auto' })
  if (absSec < 3600)
    return rtf.format(Math.round(diffSec / 60), 'minute')
  if (absSec < 86400)
    return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86400), 'day')
}

interface SourceVisual {
  Icon: typeof MessageSquare
  bg: string
  fg: string
}

function sourceVisual(note: TipNote): SourceVisual {
  const kind = note.sourceRef?.kind
  if (note.source === 'chat')
    return { Icon: MessageSquare, bg: 'bg-primary/20', fg: 'text-primary' }
  if (note.source === 'studio') {
    if (kind === 'cards')
      return { Icon: Layers, bg: 'bg-success/20', fg: 'text-success' }
    return { Icon: Sparkles, bg: 'bg-[hsl(270_60%_65%/0.2)]', fg: 'text-[hsl(270_80%_80%)]' }
  }
  return { Icon: PenLine, bg: 'bg-muted-foreground/15', fg: 'text-muted-foreground' }
}

function previewOf(html: string, max = 160): string {
  const text = htmlToPlain(html)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function NoteCard({ note, onOpen, onDiscuss, onRename, onDelete }: Props) {
  const { t, locale } = useI18n()
  const { Icon, bg, fg } = sourceVisual(note)
  const preview = previewOf(note.html) || t('tips.notes.empty.preview')
  const label = (() => {
    const kind = note.sourceRef?.kind
    if (note.source === 'chat')
      return t('tips.notes.source.chat')
    if (note.source === 'studio') {
      if (kind === 'summary')
        return t('tips.notes.source.summary')
      if (kind === 'study_guide')
        return t('tips.notes.source.studyGuide')
      if (kind === 'mind_map')
        return t('tips.notes.source.mindMap')
      if (kind === 'cards')
        return t('tips.notes.source.card')
      return t('tips.notes.source.studio')
    }
    return t('tips.notes.source.freeform')
  })()

  return (
    <article
      className="p-3 rounded-2xl border border-border bg-card shadow-lg cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onOpen(note.id)}
    >
      <div className="flex items-start gap-3">
        <span className={`inline-flex w-9 h-9 rounded-full items-center justify-center shrink-0 ${bg} ${fg}`} aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold leading-tight truncate">{note.title || t('tips.notes.untitled')}</h4>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preview}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-1 rounded hover:bg-secondary text-muted-foreground shrink-0"
            aria-label={t('tips.notes.actions.menu')}
            onClick={e => e.stopPropagation()}
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDiscuss(note.id) }}>
              <MessageSquare className="size-4" />
              <span>{t('tips.notes.actions.discuss')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(note.id) }}>
              <PenLine className="size-4" />
              <span>{t('tips.notes.actions.rename')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(note.id) }} className="text-destructive focus:text-destructive">
              <Trash2 className="size-4" />
              <span>{t('tips.notes.actions.delete')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-[11px] text-muted-foreground text-right mt-2">
        {relativeTime(note.updatedAt, locale, t('tips.notes.justNow'))}
        {' · '}
        {t('tips.notes.from')}
        {' '}
        {label}
      </p>
    </article>
  )
}
