import type { TipNote } from '@/types/tips'
import { Layers, MessageSquare, MoreHorizontal, PenLine, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/contexts/I18nContext'
import { htmlToPlain } from '@/lib/htmlText'
import { cn } from '@/lib/utils'

interface Props {
  note: TipNote
  onOpen: (id: string) => void
  onDiscuss: (id: string) => void
  onRename: (id: string, nextTitle: string) => void
  onDelete: (id: string) => void
}

function relativeTime(iso: string, locale: string, justNowLabel: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.round((then - now) / 1000)
  const absSec = Math.abs(diffSec)
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
const ENTITY_QUOT = /&quot;/g
const ENTITY_APOS = /&#39;/g
const ENTITY_AMP = /&amp;/g
const ENTITY_LT = /&lt;/g
const ENTITY_GT = /&gt;/g

function decodeEntities(text: string) {
  return text
    .replace(ENTITY_QUOT, '"')
    .replace(ENTITY_APOS, '\'')
    .replace(ENTITY_AMP, '&')
    .replace(ENTITY_LT, '<')
    .replace(ENTITY_GT, '>')
}

function previewOf(html: string, max = 220): string {
  const text = decodeEntities(htmlToPlain(html))
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function NoteCard({ note, onOpen, onDiscuss, onRename, onDelete }: Props) {
  const { t, locale } = useI18n()
  const { Icon } = sourceVisual(note)
  const preview = previewOf(note.html, 220) || t('tips.notes.empty.preview')

  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(note.title)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set synchronously in commit/cancel so the same-tick click bubbling to
  // the article suppresses onOpen even though setRenaming(false) hasn't
  // committed yet. Cleared on next event loop turn.
  const suppressOpenRef = useRef(false)

  useEffect(() => {
    if (renaming)
      inputRef.current?.select()
  }, [renaming])

  const startRename = () => {
    setDraft(note.title)
    setRenaming(true)
  }

  const finishRename = (commit: boolean) => {
    suppressOpenRef.current = true
    setTimeout(() => { suppressOpenRef.current = false }, 0)
    setRenaming(false)
    if (commit && draft.trim() !== note.title)
      onRename(note.id, draft)
    if (!commit)
      setDraft(note.title)
  }

  const { textCls, bgCls, tagLabel } = (() => {
    const kind = note.sourceRef?.kind
    if (note.source === 'chat') {
      return {
        textCls: 'text-sky-500 dark:text-sky-400',
        bgCls: 'bg-sky-500 text-white shadow-md shadow-sky-500/10 dark:shadow-sky-500/5',
        tagLabel: t('tips.notes.source.chat'),
      }
    }
    if (note.source === 'studio') {
      let label = t('tips.notes.source.studio')
      if (kind === 'summary')
        label = t('tips.notes.source.summary')
      else if (kind === 'study_guide')
        label = t('tips.notes.source.studyGuide')
      else if (kind === 'mind_map')
        label = t('tips.notes.source.mindMap')
      else if (kind === 'cards')
        label = t('tips.notes.source.card')

      if (kind === 'cards') {
        return {
          textCls: 'text-emerald-500 dark:text-emerald-400',
          bgCls: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10 dark:shadow-emerald-500/5',
          tagLabel: label,
        }
      }
      return {
        textCls: 'text-indigo-500 dark:text-indigo-400',
        bgCls: 'bg-indigo-500 text-white shadow-md shadow-indigo-500/10 dark:shadow-indigo-500/5',
        tagLabel: label,
      }
    }
    return {
      textCls: 'text-zinc-500 dark:text-zinc-400',
      bgCls: 'bg-zinc-500 text-white shadow-md shadow-zinc-500/10 dark:shadow-zinc-500/5',
      tagLabel: t('tips.notes.source.freeform'),
    }
  })()

  return (
    <article
      className="p-6 rounded-[22px] border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-xs hover:border-primary transition-colors duration-200 cursor-pointer relative overflow-hidden"
      onClick={() => {
        if (renaming || suppressOpenRef.current)
          return
        onOpen(note.id)
      }}
    >
      {/* Top row with squircle icon and action button */}
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex w-12 h-12 rounded-[16px] items-center justify-center shrink-0 ${bgCls}`}
          aria-hidden
        >
          <Icon className="size-5.5 stroke-[2.25]" />
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground/80 hover:text-foreground shrink-0 transition-colors"
            aria-label={t('tips.notes.actions.menu')}
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()} className="w-auto min-w-40">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDiscuss(note.id) }}>
              <MessageSquare className="size-4 mr-2" />
              <span>{t('tips.notes.actions.discuss')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); startRename() }}>
              <PenLine className="size-4 mr-2" />
              <span>{t('tips.notes.actions.rename')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(note.id) }} className="text-destructive focus:text-destructive">
              <Trash2 className="size-4 mr-2" />
              <span>{t('tips.notes.actions.delete')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Middle row with Title and Uppercase Tag Metadata */}
      <div className="mt-4">
        {renaming
          ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                placeholder={t('tips.notes.titlePlaceholder')}
                onClick={e => e.stopPropagation()}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => finishRename(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    finishRename(true)
                  }
                  else if (e.key === 'Escape') {
                    e.preventDefault()
                    finishRename(false)
                  }
                }}
                autoFocus
                className="w-full bg-transparent border-b border-primary text-[17px] font-bold leading-snug tracking-tight text-foreground focus:outline-none"
              />
            )
          : (
              <h4 className="text-[17px] font-bold leading-snug tracking-tight text-foreground truncate">
                {note.title || t('tips.notes.untitled')}
              </h4>
            )}
        <div className="flex items-center gap-2 mt-1.5">
          <Badge
            variant="outline"
            className={cn(
              'h-5 text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full border',
              textCls,
            )}
          >
            {tagLabel}
          </Badge>
          <span className="text-[10.5px] text-muted-foreground/30" aria-hidden>•</span>
          <span className="text-[11px] text-muted-foreground/75 font-semibold">
            {relativeTime(note.updatedAt, locale, t('tips.notes.justNow'))}
          </span>
        </div>
      </div>

      {/* Bottom row with generous description */}
      <p className="text-[13.5px] text-muted-foreground/80 leading-relaxed mt-4 line-clamp-3">
        {preview}
      </p>
    </article>
  )
}
