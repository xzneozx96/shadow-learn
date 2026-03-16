import type { LessonMeta, Segment, Word } from '@/types'
import { Check, Copy, Loader2, Search, Swords, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { useVocabulary } from '@/hooks/useVocabulary'
import { cn } from '@/lib/utils'
import { SegmentText } from './SegmentText'

interface TranscriptPanelProps {
  segments: Segment[]
  activeSegment: Segment | null
  lesson: LessonMeta
  onSegmentClick: (segment: Segment) => void
  onProgressUpdate: (segmentId: string) => void
  onShadowClick?: (segment: Segment) => void
}

export function TranscriptPanel({
  segments,
  activeSegment,
  lesson,
  onSegmentClick,
  onProgressUpdate,
  onShadowClick,
}: TranscriptPanelProps) {
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const { save, isSaved } = useVocabulary()
  const [search, setSearch] = useState('')
  const [activeLang, setActiveLang] = useState(
    lesson.translationLanguages[0] ?? 'en',
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
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

  // Stable callbacks so memo(SegmentText) is not invalidated on every render
  const handleSaveWord = useCallback(
    async (word: Word, seg: Segment) => {
      await save(word, seg, lesson, activeLang)
      toast.success('Saved to Workbook')
    },
    [save, lesson, activeLang],
  )

  const handleIsSaved = useCallback(
    (wordText: string) => isSaved(wordText, lesson.id),
    [isSaved, lesson.id],
  )

  // Event delegation for keyboard activation — one handler instead of N closures.
  // Guard: only fire if the focused element IS the segment div itself, not a child widget
  // (buttons, inputs). Without this guard, pressing Enter on a Copy/TTS button would also
  // trigger onSegmentClick in addition to the button's own click handler.
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ')
        return
      // Prevent Space from scrolling the panel (default browser behaviour on role="button")
      if (e.key === ' ')
        e.preventDefault()
      const segmentEl = (e.target as HTMLElement).closest('[data-segment-id]')
      // Only act when the segment container itself is the focused element
      if (!segmentEl || segmentEl !== e.target)
        return
      const segId = (segmentEl as HTMLElement).dataset.segmentId
      if (!segId)
        return
      const seg = filteredSegments.find(s => s.id === segId)
      if (seg)
        onSegmentClick(seg)
    },
    [filteredSegments, onSegmentClick],
  )

  const hasMultipleLangs = lesson.translationLanguages.length > 1

  function handleCopy(e: React.MouseEvent, segment: Segment) {
    e.stopPropagation()
    navigator.clipboard.writeText(segment.chinese)
    setCopiedId(segment.id)
    setTimeout(setCopiedId, 1500, null)
  }

  return (
    <div className="flex h-full flex-col bg-background/20 backdrop-blur-md">
      {/* Search bar */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search segments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
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

      {/* Segment list — single onKeyDown via event delegation */}
      <ScrollArea className="h-0 flex-1">
        <div className="divide-y divide-border/50" onKeyDown={handleListKeyDown}>
          {filteredSegments.map(segment => (
            <div
              key={segment.id}
              ref={activeSegment?.id === segment.id ? activeRef : undefined}
              role="button"
              tabIndex={0}
              data-segment-id={segment.id}
              onClick={() => onSegmentClick(segment)}
              className={cn(
                'cursor-pointer px-3 py-2.5 transition-colors hover:bg-accent/60',
                activeSegment?.id === segment.id
                && 'border-l-2 border-l-primary bg-primary/10',
              )}
            >
              <div className="flex items-start gap-2">
                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-muted-foreground">{segment.pinyin}</p>
                  <p className="text-lg text-foreground">
                    {/* key={segment.id} ensures fresh charSpanRefs when segment changes */}
                    <SegmentText
                      key={segment.id}
                      text={segment.chinese}
                      words={segment.words}
                      wordTimings={segment.wordTimings}
                      playTTS={playTTS}
                      loadingText={loadingText}
                      segment={segment}
                      onSaveWord={handleSaveWord}
                      isSaved={handleIsSaved}
                    />
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {segment.translations[activeLang] ?? Object.values(segment.translations)[0]}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    aria-label={loadingText === segment.chinese ? 'Loading pronunciation' : 'Play sentence pronunciation'}
                    onClick={(e) => {
                      e.stopPropagation()
                      playTTS(segment.chinese)
                    }}
                  >
                    {loadingText === segment.chinese
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Volume2 className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    aria-label="Copy transcription"
                    onClick={e => handleCopy(e, segment)}
                  >
                    {copiedId === segment.id
                      ? <Check className="size-4 text-green-500" />
                      : <Copy className="size-4" />}
                  </Button>
                  {onShadowClick && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-5 text-muted-foreground hover:text-foreground"
                      aria-label="Shadow from this segment"
                      onClick={(e) => {
                        e.stopPropagation()
                        onShadowClick(segment)
                      }}
                    >
                      <Swords className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
