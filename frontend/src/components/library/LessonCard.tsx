import type { TranslationKey } from '@/lib/i18n'
import type { LessonMeta } from '@/types'
import { FileVideo, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useUploadThumbnail } from '@/hooks/useUploadThumbnail'
import { cn } from '@/lib/utils'
import { getYoutubeThumbnail } from '@/lib/youtube'

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

function UploadPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#181818]">
      <FileVideo className="size-12 text-white/15" strokeWidth={1.25} />
    </div>
  )
}

export function LessonCard({ lesson, onDelete, onRename, onRetry }: LessonCardProps) {
  const { t } = useI18n()
  const { entriesByLesson } = useVocabulary()
  const vocabCount = entriesByLesson[lesson.id]?.length ?? 0
  const status = lesson.status ?? 'complete'
  const isProcessing = status === 'processing'
  const isError = status === 'error'
  const isYoutube = lesson.source === 'youtube'

  const progress = lesson.progressSegmentId && lesson.segmentCount
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  const thumbnailUrl = isYoutube ? getYoutubeThumbnail(lesson.sourceUrl) : null
  const uploadThumbnail = useUploadThumbnail(lesson.id, !isYoutube)

  const [imgFailed, setImgFailed] = useState(false)
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

  const showThumbnail = (isYoutube && thumbnailUrl && !imgFailed) || (!isYoutube && !!uploadThumbnail)

  return (
    <div
      data-testid={`lesson-card-${lesson.id}`}
      data-status={status}
      className={cn(
        'group relative flex h-full flex-col rounded-xl p-2 -m-2',
        isError && 'ring-1 ring-destructive/30',
      )}
    >
      {/* Hover background — scales in from 95% */}
      <div className="absolute inset-0 -z-10 rounded-xl bg-primary/10 scale-80 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 pointer-events-none" />

      {/* Card-level navigation link */}
      <Link
        to={`/lesson/${lesson.id}`}
        className="absolute inset-0 z-10"
        tabIndex={isEditing || isProcessing ? -1 : undefined}
        style={{ pointerEvents: isEditing || isProcessing ? 'none' : undefined }}
      />

      {/* Thumbnail */}
      <div className="relative w-full overflow-hidden rounded-xl transition-transform duration-200" style={{ aspectRatio: '16/9' }}>
        {isProcessing
          ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#181818]">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="truncate px-4 text-xs text-muted-foreground">
                  {lesson.currentStep ? t(`library.step.${lesson.currentStep}` as TranslationKey) : t('library.processing')}
                </span>
              </div>
            )
          : showThumbnail
            ? (
                <img
                  src={(isYoutube ? thumbnailUrl : uploadThumbnail) ?? undefined}
                  alt={lesson.title}
                  className="h-full w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              )
            : <UploadPlaceholder />}

        {/* Duration overlay */}
        {!isProcessing && lesson.duration != null && (
          <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
            {formatDuration(lesson.duration)}
          </div>
        )}

        {/* Progress bar */}
        {!isProcessing && !isError && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted-foreground">
            <div className="h-full bg-red-600" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col pt-3 px-3 gap-1.5">
        {/* Badge row + action menu */}
        <div className="flex items-center justify-between gap-2">
          {isYoutube
            ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-400">
                  YouTube
                </span>
              )
            : (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  {t('library.uploadSource')}
                </span>
              )}

          {/* Action menu — lives in content area so it's always visible */}
          <div className="relative z-20 ml-auto">
            <MenuRoot>
              <MenuTrigger
                render={(
                  <Button variant="ghost" size="icon" className="size-10" aria-label={t('library.lessonActions')}>
                    <MoreHorizontal className="size-5" />
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
        </div>

        {/* Title */}
        <div className="flex-1">
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
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                  {lesson.title}
                </p>
              )}
        </div>

        {/* Error state */}
        {isError && (
          <div data-testid="lesson-card-error" className="flex flex-wrap items-center gap-1.5">
            <span data-testid="lesson-card-error-badge" className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              {t('library.failed')}
            </span>
            {lesson.source === 'youtube' && onRetry && (
              <button
                data-testid="lesson-card-retry-button"
                onClick={(e) => {
                  e.preventDefault()
                  onRetry(lesson)
                }}
                className="z-20 text-xs text-muted-foreground underline hover:text-white"
              >
                {t('library.retry')}
              </button>
            )}
            {lesson.source === 'upload' && (
              <span className="text-xs text-muted-foreground">{t('library.reuploadToRetry')}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {vocabCount}
            {' '}
            {t('library.vocabWords')}
          </span>
          <span>·</span>
          <span>{formatDate(lesson.lastOpenedAt)}</span>
        </div>
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
