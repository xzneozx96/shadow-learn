import type { TipNote } from '@/features/learning-materials/domain/tips'
import { BookOpen, FileText, Layers, MessageSquare, MoreHorizontal, PenLine, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { htmlToPlain } from '@/features/learning-materials/lib/htmlText'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

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
  bgCls: string
}

function sourceVisual(note: TipNote): SourceVisual {
  const kind = note.sourceRef?.kind
  if (note.source === 'chat')
    return { Icon: MessageSquare, bgCls: 'bg-sky-500/20 text-sky-300' }
  if (note.source === 'studio') {
    if (kind === 'cards')
      return { Icon: Layers, bgCls: 'bg-emerald-500/20 text-emerald-300' }
    if (kind === 'mind_map')
      return { Icon: Sparkles, bgCls: 'bg-violet-500/20 text-violet-300' }
    if (kind === 'study_guide')
      return { Icon: BookOpen, bgCls: 'bg-blue-500/20 text-blue-300' }
    if (kind === 'summary')
      return { Icon: FileText, bgCls: 'bg-amber-500/20 text-amber-300' }
    return { Icon: Sparkles, bgCls: 'bg-violet-500/20 text-violet-300' }
  }
  return { Icon: PenLine, bgCls: 'bg-rose-500/20 text-rose-300' }
}

const ENTITY_QUOT = /&quot;/g
const ENTITY_APOS = /&#39;/g
const ENTITY_AMP = /&amp;/g
const ENTITY_LT = /&lt;/g
const ENTITY_GT = /&gt;/g
const WHITESPACE_RUN = /\s+/g

function decodeEntities(text: string) {
  return text
    .replace(ENTITY_QUOT, '"')
    .replace(ENTITY_APOS, '\'')
    .replace(ENTITY_AMP, '&')
    .replace(ENTITY_LT, '<')
    .replace(ENTITY_GT, '>')
}

function previewOf(html: string, max = 120): string {
  const text = decodeEntities(htmlToPlain(html)).replace(WHITESPACE_RUN, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function NoteCard({ note, onOpen, onDiscuss, onRename, onDelete }: Props) {
  const { t, locale } = useI18n()
  const { Icon, bgCls } = sourceVisual(note)
  const preview = previewOf(note.html) || t('tips.notes.empty.preview')
  const time = relativeTime(note.updatedAt, locale, t('tips.notes.justNow'))
  const subtitle = `${time} · ${preview}`

  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(note.title)
  const inputRef = useRef<HTMLInputElement>(null)
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

  return (
    <div
      className="relative flex items-stretch rounded-xl border border-border bg-card hover:border-primary/60 transition-colors duration-150"
      onMouseDown={(e) => {
        renamingAtMouseDownRef.current = renaming
        if (renaming && inputRef.current && !inputRef.current.contains(e.target as Node))
          finishRename(true)
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (renamingAtMouseDownRef.current) {
            renamingAtMouseDownRef.current = false
            return
          }
          onOpen(note.id)
        }}
        className="flex flex-1 min-w-0 items-center gap-3 rounded-xl px-3.5 py-3 text-left min-h-[68px] cursor-pointer active:bg-muted/40"
        aria-label={note.title || t('tips.notes.untitled')}
      >
        <div className={`shrink-0 size-10 rounded-lg flex items-center justify-center ${bgCls}`} aria-hidden>
          <Icon className="size-5" strokeWidth={2} />
        </div>

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
                  className="w-full bg-transparent border-b border-primary text-[14px] font-semibold leading-tight text-foreground focus:outline-none"
                />
              )
            : (
                <h3 className="text-[14px] font-semibold leading-tight truncate text-foreground">
                  {note.title || t('tips.notes.untitled')}
                </h3>
              )}
          <p className="text-[12px] leading-snug mt-0.5 truncate text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </button>

      <div className="flex items-center pr-2.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground/80 hover:text-foreground transition-colors"
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
    </div>
  )
}
