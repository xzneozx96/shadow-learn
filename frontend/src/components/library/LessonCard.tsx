import type { LessonMeta } from '@/types'
import { Clock, FileVideo, Trash2, Youtube } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface LessonCardProps {
  lesson: LessonMeta
  onDelete: (id: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LessonCard({ lesson, onDelete }: LessonCardProps) {
  const progress = lesson.progressSegmentId
    ? Math.min(100, Math.round((Number.parseInt(lesson.progressSegmentId, 10) / lesson.segmentCount) * 100))
    : 0

  return (
    <Card className="group relative transition-shadow hover:ring-2 hover:ring-slate-600">
      <Link to={`/lesson/${lesson.id}`} className="absolute inset-0 z-10" />

      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete(lesson.id)
        }}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>

      <CardHeader>
        <div className="flex items-center gap-2 text-slate-400">
          {lesson.source === 'youtube'
            ? <Youtube className="size-5 text-red-400" />
            : <FileVideo className="size-5 text-blue-400" />}
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
        <CardTitle className="line-clamp-2">{lesson.title}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
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
          <div className="flex justify-between text-xs text-slate-400">
            <span>Progress</span>
            <span>
              {progress}
              %
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
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
