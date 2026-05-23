import type { TranslationKey } from '@/shared/lib/i18n'
import type { LessonMeta } from '@/shared/types'
import { BookOpen, CheckCircle2, Clock, FileVideo, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/contexts/I18nContext'
import { useUploadThumbnail } from '@/features/lesson/application/useUploadThumbnail'
import { getYoutubeThumbnail } from '@/features/lesson/domain/youtube'
import { useVocabulary } from '@/features/vocabulary/application/VocabularyContext'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardFooter,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardPin,
  cutoutCardSurfaceClassName,
  CutoutCorner,
  useCutoutContentStaggerVariants,
} from '@/shared/ui/cutout-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { GlowIconPlaceholder } from '@/shared/ui/GlowIconPlaceholder'
import { MenuBackdrop, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger } from '@/shared/ui/menu'

interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (lesson: LessonMeta, newTitle: string) => void
  onRetry?: (lesson: LessonMeta) => void
  onToggleDone: (lesson: LessonMeta) => void
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
    <div className="flex h-full w-full items-center justify-center bg-muted/40">
      <FileVideo className="size-12 text-white/15" strokeWidth={1.25} />
    </div>
  )
}

function BlogPlaceholder() {
  return (
    <GlowIconPlaceholder
      className="h-full w-full"
      icon={<BookOpen className="size-6 text-primary/65" strokeWidth={1.25} />}
    />
  )
}

export function LessonCard({ lesson, onDelete, onRename, onRetry, onToggleDone }: LessonCardProps) {
  const { t } = useI18n()
  const { entriesByLesson } = useVocabulary()
  const stagger = useCutoutContentStaggerVariants()
  const vocabCount = entriesByLesson[lesson.id]?.length ?? 0
  const status = lesson.status ?? 'complete'
  const isProcessing = status === 'processing'
  const isError = status === 'error'
  const isYoutube = lesson.source === 'youtube'
  const isBlog = lesson.source === 'blog'

  const progress = lesson.progressSegmentId && lesson.segmentCount
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  const thumbnailUrl = isYoutube ? getYoutubeThumbnail(lesson.sourceUrl) : null
  const uploadThumbnail = useUploadThumbnail(lesson.id, !isYoutube && !isBlog)

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

  const showThumbnail = (isYoutube && thumbnailUrl && !imgFailed) || (!isYoutube && !isBlog && !!uploadThumbnail)
  const sourceLabel = isYoutube ? 'YouTube' : isBlog ? t('library.blogSource') : t('library.uploadSource')
  const sourceTone = isYoutube
    ? 'text-red-400'
    : 'text-primary'

  const navDisabled = isEditing || isProcessing

  return (
    <div className="w-[340px] shrink-0 flex flex-col h-full" data-testid={`lesson-card-${lesson.id}`} data-status={status}>
      <Link
        to={`/lesson/${lesson.id}`}
        aria-label={lesson.title}
        tabIndex={navDisabled ? -1 : undefined}
        onClick={(e) => {
          if (navDisabled)
            e.preventDefault()
        }}
        className="flex flex-col h-full"
      >
        <CutoutCard
          className={cn(
            cutoutCardSurfaceClassName,
            'flex-1 flex flex-col',
            isError && 'ring-1 ring-destructive/40',
          )}
        >
          <CutoutCardMedia className="aspect-video">
            {isProcessing
              ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    <span className="truncate px-4 text-sm text-muted-foreground">
                      {lesson.currentStep ? t(`library.step.${lesson.currentStep}` as TranslationKey) : t('library.processing')}
                    </span>
                  </div>
                )
              : showThumbnail
                ? (
                    <CutoutCardImage
                      src={(isYoutube ? thumbnailUrl : uploadThumbnail) ?? undefined}
                      alt={lesson.title}
                      onError={() => setImgFailed(true)}
                    />
                  )
                : isBlog
                  ? <BlogPlaceholder />
                  : <UploadPlaceholder />}

            {/* Source badge — bottom-left inset cutout */}
            <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-4 py-2">
              <span className={cn('font-bold text-xs uppercase tracking-widest', sourceTone)}>
                {sourceLabel}
              </span>
              <CutoutCorner className="absolute -right-5 -bottom-px rotate-90 text-card" size={20} />
              <CutoutCorner className="absolute -top-5 -left-px rotate-90 text-card" size={20} />
            </CutoutCardInsetLabel>

            {/* Duration pin — top-right cutout (when available, not error) */}
            {!isProcessing && !isError && lesson.duration != null && (
              <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-card px-3 py-2 text-xs font-semibold text-amber-500 tabular-nums shadow-md ring-1 ring-border/40">
                {formatDuration(lesson.duration)}
                <CutoutCorner className="absolute top-0 -left-4 -rotate-90 text-card" size={16} />
                <CutoutCorner className="absolute right-0 -bottom-4 -rotate-90 text-card" size={16} />
              </CutoutCardPin>
            )}

            {/* Error pin */}
            {isError && (
              <CutoutCardPin
                data-testid="lesson-card-error-badge"
                className="top-0 right-0 rounded-bl-[16px] bg-destructive px-3 py-2 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow-md"
              >
                {t('library.failed')}
                <CutoutCorner className="absolute top-0 -left-[23px] -rotate-90 text-destructive" size={24} />
                <CutoutCorner className="absolute right-0 -bottom-[23px] -rotate-90 text-destructive" size={24} />
              </CutoutCardPin>
            )}

            {/* Progress bar — bottom edge */}
            {!isProcessing && !isError && progress > 0 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}
          </CutoutCardMedia>

          <CutoutCardContent className="p-3 flex-1 flex flex-col">
            <motion.div animate="show" className="contents" initial="hidden" variants={stagger.container}>
              {/* Title row + action menu */}
              <motion.div className="flex items-center gap-2" variants={stagger.item}>
                <div className="min-w-0 flex-1">
                  {isEditing
                    ? (
                        <input
                          ref={inputRef}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={confirmEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full rounded border border-border bg-transparent px-1 py-0.5 text-base font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                          aria-label={t('library.renameLesson')}
                        />
                      )
                    : (
                        <h3 className="line-clamp-2 text-balance font-semibold text-card-foreground text-base leading-snug">
                          {lesson.title}
                        </h3>
                      )}
                </div>

                <div
                  className="-mr-2 -mt-1 shrink-0"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <MenuRoot>
                    <MenuTrigger
                      render={(
                        <Button variant="ghost" size="icon" className="size-9" aria-label={t('library.lessonActions')}>
                          <MoreHorizontal className="size-5" />
                        </Button>
                      )}
                    />
                    <MenuPortal>
                      <MenuBackdrop />
                      <MenuPositioner align="end">
                        <MenuPopup>
                          <MenuItem onClick={(e) => { e.preventDefault(); startEditing() }}>
                            <Pencil className="size-4" />
                            {t('library.rename')}
                          </MenuItem>
                          <MenuItem onClick={(e) => { e.preventDefault(); onToggleDone(lesson) }}>
                            <CheckCircle2 className="size-4" />
                            {lesson.isDone ? t('library.markInProgress') : t('library.markDone')}
                          </MenuItem>
                          <MenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.preventDefault(); setShowDeleteConfirm(true) }}
                          >
                            <Trash2 className="size-4" />
                            {t('common.delete')}
                          </MenuItem>
                        </MenuPopup>
                      </MenuPositioner>
                    </MenuPortal>
                  </MenuRoot>
                </div>
              </motion.div>

              {/* Error retry row */}
              {isError && (
                <motion.div
                  data-testid="lesson-card-error"
                  className="mt-2 flex flex-wrap items-center gap-2 text-xs"
                  variants={stagger.item}
                >
                  {lesson.source === 'youtube' && onRetry
                    ? (
                        <button
                          type="button"
                          data-testid="lesson-card-retry-button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRetry(lesson) }}
                          className="text-muted-foreground underline hover:text-foreground"
                        >
                          {t('library.retry')}
                        </button>
                      )
                    : (
                        <span className="text-muted-foreground">{t('library.reuploadToRetry')}</span>
                      )}
                </motion.div>
              )}

              {/* Footer */}
              <motion.div variants={stagger.item} className="mt-auto">
                <CutoutCardFooter className="mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="size-4 shrink-0" />
                    <span className="tabular-nums">{vocabCount}</span>
                    <span className="text-xs">{t('library.vocabWords')}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <Clock className="size-4 shrink-0" />
                    {formatDate(lesson.lastOpenedAt)}
                  </span>
                  {lesson.isDone && (
                    <CheckCircle2 className="size-4 shrink-0 text-green-400 ml-auto" aria-label="Done" />
                  )}
                </CutoutCardFooter>
              </motion.div>
            </motion.div>
          </CutoutCardContent>
        </CutoutCard>
      </Link>

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
            <Button size="lg" variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel' as TranslationKey)}</Button>
            <Button
              size="lg"
              variant="destructive"
              className="min-w-16"
              onClick={() => { setShowDeleteConfirm(false); onDelete(lesson.id) }}
            >
              {t('common.delete' as TranslationKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
