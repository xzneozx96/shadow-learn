import type { Segment } from '@/types'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { getVideo, saveLessonMeta } from '@/db'
import { useActiveSegment } from '@/hooks/useActiveSegment'
import { useLesson } from '@/hooks/useLesson'
import { CompanionPanel } from './CompanionPanel'
import { TranscriptPanel } from './TranscriptPanel'
import { VideoPanel } from './VideoPanel'

export function LessonView() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const { db, keys } = useAuth()
  const { player } = usePlayer()
  const { updateLesson } = useLessons()
  const { meta, segments, loading, error, updateMeta } = useLesson(db, id)
  const activeSegment = useActiveSegment(segments)

  const [videoBlob, setVideoBlob] = useState<Blob | undefined>()
  type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking', segments: Segment[] }
  const [shadowingMode, setShadowingMode] = useState<ShadowingActiveMode>(null)
  const [pickerSegment, setPickerSegment] = useState<Segment | null>(null)
  const pickerStartIdx = pickerSegment
    ? segments.findIndex(s => s.id === pickerSegment.id)
    : -1
  const totalRemaining = pickerStartIdx >= 0 ? segments.length - pickerStartIdx : 0

  // Load media blob (video for uploads, audio for YouTube lessons)
  useEffect(() => {
    if (!db || !id || !meta)
      return
    getVideo(db, id).then((blob) => {
      if (blob)
        setVideoBlob(blob)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, meta?.id])

  const handleSegmentClick = useCallback((segment: { start: number }) => {
    if (!player)
      return
    player.seekTo(segment.start)
    player.play()
  }, [player])

  const handleProgressUpdate = useCallback((segmentId: string) => {
    if (!db || !meta)
      return
    saveLessonMeta(db, { ...meta, progressSegmentId: segmentId })
  }, [db, meta])

  const handleRename = useCallback(async (newTitle: string) => {
    if (!meta)
      return
    await updateLesson({ ...meta, title: newTitle })
    updateMeta({ title: newTitle })
  }, [meta, updateLesson, updateMeta])

  const handleShadowingStart = useCallback(
    (mode: 'dictation' | 'speaking', count: number | 'all') => {
      if (pickerStartIdx === -1)
        return
      const slice = count === 'all'
        ? segments.slice(pickerStartIdx)
        : segments.slice(pickerStartIdx, pickerStartIdx + count)
      setShadowingMode({ mode, segments: slice })
      setPickerSegment(null)
    },
    [segments, pickerStartIdx],
  )

  const handleShadowClick = useCallback((segment: Segment) => {
    setPickerSegment(segment)
  }, [])

  const handleShadowingExit = useCallback(() => {
    setShadowingMode(null)
  }, [])

  const speakingAvailable
    = Boolean(keys?.azureSpeechKey && keys?.azureSpeechRegion)
      && typeof MediaRecorder !== 'undefined'

  const [searchParams] = useSearchParams()
  const deepLinkSegmentId = searchParams.get('segmentId')

  // Seek and scroll to deep-linked segment once segments are loaded
  useEffect(() => {
    if (!deepLinkSegmentId || segments.length === 0)
      return
    const target = segments.find(s => s.id === deepLinkSegmentId)
    if (!target)
      return
    if (player) {
      player.seekTo(target.start)
    }
    document.querySelector(`[data-segment-id="${deepLinkSegmentId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [segments, deepLinkSegmentId, player])

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center glass-bg">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (error || !meta) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 glass-bg">
        <p className="text-sm text-red-400">{error ?? t('lesson.notFound')}</p>
        <Button variant="outline" render={<Link to="/" />}>
          {t('lesson.backToLibrary')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Video Panel — 36% */}
      <div className="h-full overflow-hidden border-r border-border" style={{ width: '36%' }}>
        <VideoPanel
          lesson={meta}
          segments={segments}
          activeSegment={activeSegment}
          videoBlob={videoBlob}
          onRename={handleRename}
        />
      </div>

      {/* Transcript / Shadowing Panel — 34% */}
      <div className="h-full overflow-hidden border-r border-border" style={{ width: '34%' }}>
        {shadowingMode
          ? (
              <ShadowingPanel
                segments={shadowingMode.segments}
                mode={shadowingMode.mode}
                azureKey={keys?.azureSpeechKey ?? ''}
                azureRegion={keys?.azureSpeechRegion ?? ''}
                onExit={handleShadowingExit}
                lesson={meta}
              />
            )
          : (
              <TranscriptPanel
                segments={segments}
                activeSegment={activeSegment}
                lesson={meta}
                onSegmentClick={handleSegmentClick}
                onProgressUpdate={handleProgressUpdate}
                onShadowClick={handleShadowClick}
              />
            )}
      </div>

      {/* Companion Panel — flex-1 */}
      <div className="h-full flex-1 overflow-hidden">
        <CompanionPanel
          activeSegment={activeSegment}
          lessonId={id ?? ''}
          lessonTitle={meta.title}
        />
      </div>

      <Dialog
        open={pickerSegment !== null && pickerStartIdx >= 0}
        onOpenChange={(open) => {
          if (!open)
            setPickerSegment(null)
        }}
      >
        <DialogContent className="max-w-sm p-5">
          {pickerSegment !== null && pickerStartIdx >= 0 && (
            <ShadowingModePicker
              startSegment={pickerSegment}
              startSegmentNumber={pickerStartIdx + 1}
              totalRemaining={totalRemaining}
              speakingAvailable={speakingAvailable}
              onStart={handleShadowingStart}
              onClose={() => setPickerSegment(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
