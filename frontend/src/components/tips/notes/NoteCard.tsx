import type { TipNote } from '@/types/tips'
import { BookOpen, FileText, Layers, MessageSquare, MoreHorizontal, PenLine, Sparkles, Trash2 } from 'lucide-react'
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
    if (kind === 'mind_map')
      return { Icon: Sparkles, bg: 'bg-violet-500/20', fg: 'text-violet-300' }
    if (kind === 'study_guide')
      return { Icon: BookOpen, bg: 'bg-blue-500/20', fg: 'text-blue-300' }
    if (kind === 'summary')
      return { Icon: FileText, bg: 'bg-amber-500/20', fg: 'text-amber-300' }
    return { Icon: Sparkles, bg: 'bg-violet-500/20', fg: 'text-violet-300' }
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
  // Captures `renaming` at mousedown so the trailing click can read the
  // pre-commit state synchronously — defends against React batching
  // setRenaming(false) into the same event tick.
  const renamingAtMouseDownRef = useRef(false)

  useEffect(() => {
    if (renaming)
      inputRef.current?.select()
  }, [renaming])

  const startRename = () => {
    setDraft(note.title)
    setRenaming(true)
  }

  const finishRename = (commit: boolean) => {
    setRenaming(false)
    if (commit && draft.trim() !== note.title)
      onRename(note.id, draft)
    if (!commit)
      setDraft(note.title)
  }

  const { bgCls, tagLabel } = (() => {
    const kind = note.sourceRef?.kind
    if (note.source === 'chat') {
      return {
        bgCls: 'bg-sky-500/20 text-sky-300',
        tagLabel: t('tips.notes.source.chat'),
      }
    }
    if (note.source === 'studio') {
      let label = t('tips.notes.source.studio')
      let bg = 'bg-violet-500/20 text-violet-300'
      if (kind === 'summary') {
        label = t('tips.notes.source.summary')
        bg = 'bg-amber-500/20 text-amber-300'
      }
      else if (kind === 'study_guide') {
        label = t('tips.notes.source.studyGuide')
        bg = 'bg-blue-500/20 text-blue-300'
      }
      else if (kind === 'mind_map') {
        label = t('tips.notes.source.mindMap')
        bg = 'bg-violet-500/20 text-violet-300'
      }
      else if (kind === 'cards') {
        label = t('tips.notes.source.card')
        bg = 'bg-emerald-500/20 text-emerald-300'
      }
      return { bgCls: bg, tagLabel: label }
    }
    return {
      bgCls: 'bg-zinc-500/20 text-zinc-300',
      tagLabel: t('tips.notes.source.freeform'),
    }
  })()

  return (
    <article
      className="p-6 rounded-xl border bg-card hover:border-primary transition-colors duration-200 cursor-pointer relative overflow-hidden"
      onMouseDown={(e) => {
        // Capture the pre-commit state synchronously: setRenaming(false)
        // queued by finishRename is batched into this event tick, so by the
        // time the trailing click fires the `renaming` closure may already
        // read false. The ref pins the gesture's intent.
        renamingAtMouseDownRef.current = renaming
        // Article is not focusable — mousedown outside the input does NOT
        // blur it. Commit the rename explicitly here.
        if (renaming && inputRef.current && !inputRef.current.contains(e.target as Node))
          finishRename(true)
      }}
      onClick={() => {
        if (renamingAtMouseDownRef.current) {
          renamingAtMouseDownRef.current = false
          return
        }
        onOpen(note.id)
      }}
    >
      {/* Header row: icon + (title above meta) + action menu */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex w-12 h-12 rounded-[16px] items-center justify-center shrink-0 ${bgCls}`}
          aria-hidden
        >
          <Icon className="size-5.5 stroke-[2.25]" />
        </span>

        <div className="flex-1 min-w-0">
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
                  className="w-full bg-transparent border-b border-primary text-base font-bold leading-snug tracking-tight text-foreground focus:outline-none"
                />
              )
            : (
                <h4 className="text-base font-bold leading-snug tracking-tight text-foreground truncate">
                  {note.title || t('tips.notes.untitled')}
                </h4>
              )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="accent" className="h-5 text-xs">
              {tagLabel}
            </Badge>
            <span className="text-[10.5px] text-muted-foreground/30" aria-hidden>•</span>
            <span className="text-[11px] text-muted-foreground/75 font-semibold">
              {relativeTime(note.updatedAt, locale, t('tips.notes.justNow'))}
            </span>
          </div>
        </div>

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

      {/* Bottom row with generous description */}
      <p className="text-sm text-muted-foreground/80 leading-relaxed mt-3 line-clamp-3">
        {preview}
      </p>
    </article>
  )
}
