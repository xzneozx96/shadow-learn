import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { getSettings, getVideo, saveLessonMeta } from '@/db'
import { useActiveSegment } from '@/hooks/useActiveSegment'
import { useChat } from '@/hooks/useChat'
import { useLesson } from '@/hooks/useLesson'
import { CompanionPanel } from './CompanionPanel'
import { TranscriptPanel } from './TranscriptPanel'
import { VideoPanel } from './VideoPanel'

export function LessonView() {
  const { id } = useParams<{ id: string }>()
  const { db, keys } = useAuth()
  const { player, currentTime } = usePlayer()
  const { meta, segments, loading, error } = useLesson(db, id)
  const activeSegment = useActiveSegment(segments, currentTime)

  const [videoBlob, setVideoBlob] = useState<Blob | undefined>()
  const [model, setModel] = useState('openai/gpt-4o-mini')

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

  // Load video blob for uploaded lessons
  useEffect(() => {
    if (!db || !id || !meta || meta.source !== 'upload')
      return
    getVideo(db, id).then((blob) => {
      if (blob)
        setVideoBlob(blob)
    })
  }, [db, id, meta])

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

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // Error state
  if (error || !meta) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900">
        <p className="text-sm text-red-400">{error ?? 'Lesson not found'}</p>
        <Button variant="outline" asChild>
          <Link to="/">Back to Library</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Video Panel — 36% */}
      <div className="flex h-full flex-col" style={{ width: '36%' }}>
        <VideoPanel
          lesson={meta}
          segments={segments}
          activeSegment={activeSegment}
          videoBlob={videoBlob}
        />
      </div>

      {/* Transcript Panel — 34% */}
      <div className="h-full" style={{ width: '34%' }}>
        <TranscriptPanel
          segments={segments}
          activeSegment={activeSegment}
          lesson={meta}
          onSegmentClick={handleSegmentClick}
          onProgressUpdate={handleProgressUpdate}
        />
      </div>

      {/* Companion Panel — flex-1 */}
      <div className="h-full flex-1">
        <CompanionPanel
          messages={messages}
          isStreaming={isStreaming}
          onSend={sendMessage}
          activeSegment={activeSegment}
          model={model}
          onModelChange={setModel}
        />
      </div>
    </div>
  )
}
