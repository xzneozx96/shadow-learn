import type { LessonMeta, Segment, Word } from '@/types'
import { Check, Copy, Languages, Search, Volume2 } from 'lucide-react'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useVocabulary } from '@/contexts/VocabularyContext'
import { useTTS } from '@/hooks/useTTS'
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

const SEGMENT_BATCH_SIZE = 20

// -----------------------------------------------------------------
// SegmentRow — memoised so that only the rows whose props actually
// change re-render.  Parent state like `copiedId` or `activeSegment`
// only causes the two affected rows (old active + new active) to
// re-render instead of the entire visible list.
// -----------------------------------------------------------------
interface SegmentRowProps {
  segment: Segment
  isActive: boolean
  forceSpoken: boolean
  // null is part of the DOM ref type in React 19+
  activeRef: React.RefObject<HTMLDivElement | null>
  activeLang: string
  showRomanization: boolean
  copiedId: string | null
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  onSaveWord: (word: Word, seg: Segment) => Promise<void>
  onRemoveWord: (word: Word) => Promise<void>
  isSaved: (wordText: string) => boolean
  onSegmentClick: (segment: Segment) => void
  onCopy: (e: React.MouseEvent, segment: Segment) => void
  onShadowClick?: (segment: Segment) => void
}

const SegmentRow = memo(({
  segment,
  isActive,
  forceSpoken,
  activeRef,
  activeLang,
  showRomanization,
  copiedId,
  playTTS,
  loadingText,
  onSaveWord,
  onRemoveWord,
  isSaved,
  onSegmentClick,
  onCopy,
  onShadowClick,
}: SegmentRowProps) => {
  return (
    <div
      ref={isActive ? activeRef : undefined}
      className={cn(
        'p-3 transition-colors',
        isActive && 'border-l-2 border-l-primary bg-primary/10',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Text content */}
        <div className="min-w-0 flex-1 text-justify">
          <div className="text-foreground">
            {/* key={segment.id} ensures fresh charSpanRefs when segment changes */}
            <SegmentText
              key={segment.id}
              text={segment.text}
              words={segment.words}
              wordTimings={segment.wordTimings}
              playTTS={playTTS}
              loadingText={loadingText}
              segment={segment}
              onSaveWord={onSaveWord}
              onRemoveWord={onRemoveWord}
              isSaved={isSaved}
              showRomanization={showRomanization}
              enableKaraoke={isActive}
              forceSpoken={forceSpoken}
            />
          </div>
          <p className="mt-1 text-muted-foreground">
            {segment.translations[activeLang] ?? Object.values(segment.translations)[0]}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Play from here"
            onClick={(e) => {
              e.stopPropagation()
              onSegmentClick(segment)
            }}
          >
            <Volume2 className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Copy transcription"
            onClick={e => onCopy(e, segment)}
          >
            {copiedId === segment.id
              ? <Check className="size-5 text-green-500" />
              : <Copy className="size-5" />}
          </Button>
          {onShadowClick && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="Shadow from this segment"
              onClick={(e) => {
                e.stopPropagation()
                onShadowClick(segment)
              }}
            >
              <span className="text-lg flex items-center justify-center">🎯</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})

export function TranscriptPanel({
  segments,
  activeSegment,
  lesson,
  onSegmentClick,
  onProgressUpdate,
  onShadowClick,
}: TranscriptPanelProps) {
  const { t } = useI18n()
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys, lesson.sourceLanguage ?? 'zh-CN')
  const { entriesByLesson, save, remove, isSaved } = useVocabulary()
  const [search, setSearch] = useState('')
  // useDeferredValue keeps the text input responsive — the heavy list
  // filter only runs after React has committed the urgent input update.
  const deferredSearch = useDeferredValue(search)
  const [activeLang, setActiveLang] = useState(
    lesson.translationLanguages[0] ?? 'en',
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showRomanization, setShowRomanization] = useState(true)
  const [visibleCount, setVisibleCount] = useState(SEGMENT_BATCH_SIZE)
  const activeRef = useRef<HTMLDivElement>(null)
  const prevScrolledActiveIdRef = useRef<string | null>(null)

  // Notify progress update when active segment changes
  useEffect(() => {
    if (activeSegment) {
      onProgressUpdate(activeSegment.id)
    }
  }, [activeSegment, onProgressUpdate])

  const filteredSegments = useMemo(() => {
    if (!deferredSearch.trim())
      return segments
    const q = deferredSearch.trim().toLowerCase()
    return segments.filter((seg) => {
      if (seg.text.toLowerCase().includes(q))
        return true
      for (const val of Object.values(seg.translations)) {
        if (val.toLowerCase().includes(q))
          return true
      }
      return false
    })
  }, [segments, deferredSearch])

  useEffect(() => {
    setVisibleCount(SEGMENT_BATCH_SIZE)
  }, [filteredSegments])

  // Ensure the active segment is always mounted, even for long lessons where
  // incremental rendering initially shows only the first batch.
  useEffect(() => {
    if (!activeSegment)
      return
    const activeIdx = filteredSegments.findIndex(s => s.id === activeSegment.id)
    if (activeIdx === -1)
      return
    const minVisible = Math.ceil((activeIdx + 1) / SEGMENT_BATCH_SIZE) * SEGMENT_BATCH_SIZE
    setVisibleCount(prev => (prev >= minVisible ? prev : Math.min(minVisible, filteredSegments.length)))
  }, [activeSegment, filteredSegments])

  const visibleSegments = useMemo(
    () => filteredSegments.slice(0, visibleCount),
    [filteredSegments, visibleCount],
  )

  // Auto-scroll to active segment once it is actually rendered.
  // This avoids a race where activeSegment changes before incremental
  // rendering has mounted that row.
  useEffect(() => {
    if (!activeSegment)
      return
    if (activeSegment.id === prevScrolledActiveIdRef.current)
      return
    const isRendered = visibleSegments.some(s => s.id === activeSegment.id)
    if (!isRendered)
      return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    prevScrolledActiveIdRef.current = activeSegment.id
  }, [activeSegment, visibleSegments])

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceToBottom > 600)
      return
    setVisibleCount(prev => Math.min(prev + SEGMENT_BATCH_SIZE, filteredSegments.length))
  }, [filteredSegments.length])

  // Stable callbacks so memo(SegmentText) is not invalidated on every render
  const handleSaveWord = useCallback(
    async (word: Word, seg: Segment) => {
      try {
        await save(word, seg, lesson, activeLang)
        toast.success(t('lesson.savedToWorkbook'))
      }
      catch {
        // VocabularyContext already showed the error toast
      }
    },
    [save, lesson, activeLang, t],
  )

  const handleIsSaved = useCallback(
    (wordText: string) => isSaved(wordText, lesson.id),
    [isSaved, lesson.id],
  )

  // Keep a ref to entriesByLesson so handleRemoveWord is stable (not
  // recreated whenever any vocabulary entry changes anywhere in the app).
  const entriesByLessonRef = useRef(entriesByLesson)
  entriesByLessonRef.current = entriesByLesson

  const handleRemoveWord = useCallback(
    async (word: Word) => {
      const lessonEntries = entriesByLessonRef.current[lesson.id] ?? []
      const entry = lessonEntries.find(e => e.word === word.word)
      if (!entry)
        return
      try {
        await remove(entry.id)
        toast.success(t('lesson.removedFromWorkbook'))
      }
      catch {
        // VocabularyContext already showed the error toast
      }
    },
    [lesson.id, remove, t],
  )

  const hasMultipleLangs = lesson.translationLanguages.length > 1

  const handleCopy = useCallback((e: React.MouseEvent, segment: Segment) => {
    e.stopPropagation()
    navigator.clipboard.writeText(segment.text)
    setCopiedId(segment.id)
    setTimeout(setCopiedId, 1500, null)
  }, [])

  return (
    <div className="flex h-full flex-col bg-background backdrop-blur-md">
      {/* Search bar */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('lesson.searchSegments')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            variant={showRomanization ? 'secondary' : 'ghost'}
            size="icon-lg"
            aria-label={showRomanization ? 'Hide romanization' : 'Show romanization'}
            onClick={() => setShowRomanization(v => !v)}
          >
            <Languages className="size-4" />
          </Button>
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
      <div className="h-0 flex-1 overflow-y-auto" onScroll={handleListScroll}>
        <div className="divide-y divide-border/50">
          {visibleSegments.map(segment => (
            // Keep completed segments highlighted while avoiding per-tick karaoke work.
            // activeSegment.start is the current playback cursor segment start.
            // Any segment ending at/before that start is fully spoken.
            // (Current active segment uses live karaoke coloring.)
            // Note: this preserves prior behavior where past segments stay yellow.
            <SegmentRow
              key={segment.id}
              segment={segment}
              isActive={activeSegment?.id === segment.id}
              forceSpoken={!!activeSegment && segment.end <= activeSegment.start && segment.id !== activeSegment.id}
              activeRef={activeRef}
              activeLang={activeLang}
              showRomanization={showRomanization}
              copiedId={copiedId}
              playTTS={playTTS}
              loadingText={loadingText}
              onSaveWord={handleSaveWord}
              onRemoveWord={handleRemoveWord}
              isSaved={handleIsSaved}
              onSegmentClick={onSegmentClick}
              onCopy={handleCopy}
              onShadowClick={onShadowClick}
            />
          ))}
        </div>
      </div>

    </div>
  )
}
