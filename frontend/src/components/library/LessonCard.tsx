import type { TranslationKey } from '@/lib/i18n'
import type { LessonMeta } from '@/types'
import { Clock, FileVideo, Loader2, MoreHorizontal, Pencil, Trash2, Youtube } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MenuBackdrop, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger } from '@/components/ui/menu'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (lesson: LessonMeta, newTitle: string) => void
  onRetry?: (lesson: LessonMeta) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LessonCard({ lesson, onDelete, onRename, onRetry }: LessonCardProps) {
  const { t } = useI18n()
  const status = lesson.status ?? 'complete'
  const isProcessing = status === 'processing'
  const isError = status === 'error'

  // const progress = lesson.progressSegmentId && lesson.segmentCount
  //   ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
  //   : 0

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const isCancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing)
      inputRef.current?.select()
  }, [isEditing])

  function startEditing() {
    isCancelledRef.current = false
    setEditValue(lesson.title)
    setIsEditing(true)
  }

  function confirmEdit() {
    if (isCancelledRef.current)
      return
    const trimmed = editValue.trim()
    if (trimmed)
      onRename(lesson, trimmed)
    setIsEditing(false)
  }

  function cancelEdit() {
    isCancelledRef.current = true
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const isYoutube = lesson.source === 'youtube'

  return (
    <div
      className={cn(
        'group relative flex h-full min-h-[180px] flex-col overflow-hidden rounded-xl transition-all duration-200',
        'elegant-card border border-border hover:border-b-primary',
        isError && 'ring-1 ring-destructive/30',
      )}
    >
      {/* Card-level navigation link */}
      <Link
        to={`/lesson/${lesson.id}`}
        className="absolute inset-0 z-10"
        tabIndex={isEditing || isProcessing ? -1 : undefined}
        style={{ pointerEvents: isEditing || isProcessing ? 'none' : undefined }}
      />

      {/* Action menu — top-right, appears on hover */}
      <div className="absolute right-2 top-2 z-20">
        <MenuRoot>
          <MenuTrigger
            render={(
              <Button variant="ghost" size="icon-sm" aria-label={t('library.lessonActions')}>
                <MoreHorizontal className="size-4" />
              </Button>
            )}
          />
          <MenuPortal>
            <MenuBackdrop />
            <MenuPositioner align="end">
              <MenuPopup>
                <MenuItem
                  onClick={(e) => {
                    e.preventDefault()
                    startEditing()
                  }}
                >
                  <Pencil className="size-4" />
                  {t('library.rename')}
                </MenuItem>
                <MenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowDeleteConfirm(true)
                  }}
                >
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </MenuItem>
              </MenuPopup>
            </MenuPositioner>
          </MenuPortal>
        </MenuRoot>
      </div>

      {/* Source icon */}
      <div className="px-4 pt-4 pb-3">
        {isYoutube
          ? <Youtube className="size-7 text-red-400/80" />
          : <FileVideo className="size-7 text-muted-foreground" />}
      </div>

      {/* Title */}
      <div className="flex-1 px-4 pb-2">
        {isEditing
          ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={confirmEdit}
                onKeyDown={handleKeyDown}
                className="w-full rounded border border-border bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                aria-label={t('library.renameLesson')}
              />
            )
          : (
              <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">
                {lesson.title}
              </p>
            )}
      </div>

      {/* Status indicator */}
      {isProcessing && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span className="truncate">{lesson.currentStep ? t(`library.step.${lesson.currentStep}` as TranslationKey) : t('library.processing')}</span>
        </div>
      )}
      {isError && (
        <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-sm font-medium text-destructive">
            {t('library.failed')}
          </span>
          {lesson.source === 'youtube' && onRetry && (
            <button
              onClick={(e) => {
                e.preventDefault()
                onRetry(lesson)
              }}
              className="z-20 text-sm text-muted-foreground underline hover:text-white"
            >
              {t('library.retry')}
            </button>
          )}
          {lesson.source === 'upload' && (
            <span className="text-sm text-muted-foreground">{t('library.reuploadToRetry')}</span>
          )}
        </div>
      )}

      {/* Footer: date + meta */}
      <div className="px-4 pb-3 pt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{formatDate(lesson.lastOpenedAt)}</span>
        {!isProcessing && lesson.duration != null && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" />
              {formatDuration(lesson.duration)}
            </span>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open)
            setShowDeleteConfirm(false)
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('library.deleteTitle' as TranslationKey)}</DialogTitle>
            <DialogDescription>{t('library.deleteDescription' as TranslationKey)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel' as TranslationKey)}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false)
                onDelete(lesson.id)
              }}
            >
              {t('common.delete' as TranslationKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
