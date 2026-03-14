import type { LessonMeta, Segment } from '@/types'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { WordTooltip } from './WordTooltip'

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface TranscriptPanelProps {
  segments: Segment[]
  activeSegment: Segment | null
  lesson: LessonMeta
  onSegmentClick: (segment: Segment) => void
  onProgressUpdate: (segmentId: string) => void
}

export function TranscriptPanel({
  segments,
  activeSegment,
  lesson,
  onSegmentClick,
  onProgressUpdate,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState('')
  const [activeLang, setActiveLang] = useState(
    lesson.translationLanguages[0] ?? 'en',
  )
  const activeRef = useRef<HTMLDivElement>(null)
  const prevActiveIdRef = useRef<string | null>(null)

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegment && activeSegment.id !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeSegment.id
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegment])

  // Notify progress update when active segment changes
  useEffect(() => {
    if (activeSegment) {
      onProgressUpdate(activeSegment.id)
    }
  }, [activeSegment, onProgressUpdate])

  const filteredSegments = useMemo(() => {
    if (!search.trim())
      return segments
    const q = search.trim().toLowerCase()
    return segments.filter((seg) => {
      if (seg.chinese.toLowerCase().includes(q))
        return true
      for (const val of Object.values(seg.translations)) {
        if (val.toLowerCase().includes(q))
          return true
      }
      return false
    })
  }, [segments, search])

  const hasMultipleLangs = lesson.translationLanguages.length > 1

  return (
    <div className="flex h-full flex-col border-x border-slate-800 bg-slate-950">
      {/* Search bar */}
      <div className="space-y-2 border-b border-slate-800 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search segments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Language toggle */}
        {hasMultipleLangs && (
          <div className="flex gap-1">
            {lesson.translationLanguages.map(lang => (
              <Button
                key={lang}
                variant={activeLang === lang ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setActiveLang(lang)}
              >
                {lang.toUpperCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Segment list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-slate-800/50">
          {filteredSegments.map(segment => (
            <div
              key={segment.id}
              ref={activeSegment?.id === segment.id ? activeRef : undefined}
              role="button"
              tabIndex={0}
              onClick={() => onSegmentClick(segment)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  onSegmentClick(segment)
              }}
              className={cn(
                'group cursor-pointer px-3 py-2.5 transition-colors hover:bg-slate-800/50',
                activeSegment?.id === segment.id
                && 'border-l-2 border-l-blue-500 bg-blue-500/5',
              )}
            >
              {/* Pinyin */}
              <p className="mb-0.5 text-xs text-slate-500">
                {segment.pinyin}
              </p>

              {/* Chinese text with word tooltips */}
              <p className="text-base text-slate-100">
                <WordTooltip text={segment.chinese} words={segment.words} />
              </p>

              {/* Translation */}
              <p className="mt-1 text-sm text-slate-400">
                {segment.translations[activeLang] ?? Object.values(segment.translations)[0]}
              </p>

              {/* Timestamp on hover */}
              <span className="mt-1 hidden font-mono text-xs text-slate-600 group-hover:inline-block">
                {formatTimestamp(segment.start)}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
