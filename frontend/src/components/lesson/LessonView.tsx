import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { getSettings, getVideo, saveLessonMeta } from '@/db'
import { useActiveSegment } from '@/hooks/useActiveSegment'
import { useChat } from '@/hooks/useChat'
import { useLesson } from '@/hooks/useLesson'
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
import { CompanionPanel } from './CompanionPanel'
import { TranscriptPanel } from './TranscriptPanel'
import { VideoPanel } from './VideoPanel'

export function LessonView() {
  const { id } = useParams<{ id: string }>()
  const { db, keys } = useAuth()
  const { player } = usePlayer()
  const { updateLesson } = useLessons()
  const { meta, segments, loading, error, updateMeta } = useLesson(db, id)
  const activeSegment = useActiveSegment(segments)

  const [videoBlob, setVideoBlob] = useState<Blob | undefined>()
  const [model, setModel] = useState('gpt-4o-mini')
  type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking' }
  const [shadowingMode, setShadowingMode] = useState<ShadowingActiveMode>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Load settings for default model
  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((settings) => {
      if (settings?.defaultModel) {
        setModel(settings.defaultModel)
      }
    })
  }, [db])

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

  // Context segments: a window around the active segment
  const contextSegments = useMemo(() => {
    if (!activeSegment)
      return segments.slice(0, 5)
    const idx = segments.findIndex(s => s.id === activeSegment.id)
    const start = Math.max(0, idx - 2)
    const end = Math.min(segments.length, idx + 3)
    return segments.slice(start, end)
  }, [segments, activeSegment])

  const { messages, isStreaming, sendMessage } = useChat(
    db,
    id,
    meta?.title ?? '',
    activeSegment,
    contextSegments,
    keys,
    model,
  )

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

  const handleShadowingClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handleShadowingStart = useCallback((mode: 'dictation' | 'speaking') => {
    setShadowingMode({ mode })
    setPickerOpen(false)
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
        <p className="text-sm text-red-400">{error ?? 'Lesson not found'}</p>
        <Button variant="outline" render={<Link to="/" />}>
          Back to Library
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
                segments={segments}
                mode={shadowingMode.mode}
                azureKey={keys?.azureSpeechKey ?? ''}
                azureRegion={keys?.azureSpeechRegion ?? ''}
                onExit={handleShadowingExit}
              />
            )
          : (
              <TranscriptPanel
                segments={segments}
                activeSegment={activeSegment}
                lesson={meta}
                onSegmentClick={handleSegmentClick}
                onProgressUpdate={handleProgressUpdate}
                onShadowingClick={handleShadowingClick}
              />
            )}
      </div>

      {/* Companion Panel — flex-1 */}
      <div className="h-full flex-1 overflow-hidden">
        <CompanionPanel
          messages={messages}
          isStreaming={isStreaming}
          onSend={sendMessage}
          activeSegment={activeSegment}
          model={model}
          onModelChange={setModel}
          lessonId={id ?? ''}
        />
      </div>

      <ShadowingModePicker
        open={pickerOpen}
        speakingAvailable={speakingAvailable}
        onStart={handleShadowingStart}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  )
}
