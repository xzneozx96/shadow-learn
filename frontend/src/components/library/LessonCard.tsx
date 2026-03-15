import type { LessonMeta } from '@/types'
import { Clock, FileVideo, MoreHorizontal, Trash2, Youtube } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MenuBackdrop, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger } from '@/components/ui/menu'

interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
  onRename: (lesson: LessonMeta, newTitle: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LessonCard({ lesson, onDelete, onRename }: LessonCardProps) {
  const progress = lesson.progressSegmentId
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const isCancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus + select all text when editing starts
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

  return (
    <Card className="group relative flex flex-col transition-shadow hover:ring-2 hover:ring-white/15">
      {/* Card-level navigation link — disabled while editing to allow input interaction */}
      <Link
        to={`/lesson/${lesson.id}`}
        className="absolute inset-0 z-10"
        tabIndex={isEditing ? -1 : undefined}
        style={{ pointerEvents: isEditing ? 'none' : undefined }}
      />

      {/* Action menu — always visible on hover, z-index above the link */}
      <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
        <MenuRoot>
          <MenuTrigger
            render={(
              <Button variant="ghost" size="icon-sm" aria-label="Lesson actions">
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
                  Rename
                </MenuItem>
                <MenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    onDelete(lesson.id)
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </MenuItem>
              </MenuPopup>
            </MenuPositioner>
          </MenuPortal>
        </MenuRoot>
      </div>

      <CardHeader>
        <div className="flex items-center gap-2 text-white/40 mb-2">
          {lesson.source === 'youtube'
            ? <Youtube className="size-5 text-red-400" />
            : <FileVideo className="size-5 text-white/50" />}
          <div className="flex items-center gap-1 text-xs">
            <Clock className="size-3" />
            {formatDuration(lesson.duration)}
          </div>
          <span className="text-xs">
            {lesson.segmentCount}
            {' '}
            segments
          </span>
        </div>

        {isEditing
          ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={confirmEdit}
                onKeyDown={handleKeyDown}
                className="w-full rounded border border-border bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                aria-label="Rename lesson"
              />
            )
          : (
              <CardTitle className="line-clamp-2">{lesson.title}</CardTitle>
            )}
      </CardHeader>

      <CardContent className="mt-auto flex flex-col gap-3">
        {lesson.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lesson.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-white/40">
            <span>Progress</span>
            <span>
              {progress}
              %
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
