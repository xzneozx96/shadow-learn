import type { Segment } from '@/types'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AgentActionsProvider, useAgentActions } from '@/contexts/AgentActionsContext'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { getVideo, saveLessonMeta } from '@/db'
import { useActiveSegment } from '@/hooks/useActiveSegment'
import { useLesson } from '@/hooks/useLesson'
import { useTimeEffect } from '@/hooks/useTimeEffect'
import { getLanguageCaps } from '@/lib/language-caps'
import { CompanionPanel } from './CompanionPanel'
import { TranscriptPanel } from './TranscriptPanel'
import { VideoPanel } from './VideoPanel'

function LessonViewContent() {
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
  const [companionTab, setCompanionTab] = useState('ai')

  const hasRestoredRef = useRef(false)
  const progressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSegmentIdRef = useRef<string | null>(null)
  // Keep refs current so the unmount cleanup sees up-to-date values
  const dbRef = useRef(db)
  dbRef.current = db
  const metaRef = useRef(meta)
  metaRef.current = meta

  const pickerStartIdx = pickerSegment
    ? segments.findIndex(s => s.id === pickerSegment.id)
    : -1
  const totalRemaining = pickerStartIdx >= 0 ? segments.length - pickerStartIdx : 0

  // End time for agent-triggered single-segment playback; null when inactive
  const playSegmentStopAtRef = useRef<number | null>(null)
  useTimeEffect((t) => {
    if (playSegmentStopAtRef.current !== null && t >= playSegmentStopAtRef.current) {
      playSegmentStopAtRef.current = null
      player?.pause()
    }
  }, null)

  const { pendingAction, clearAction } = useAgentActions()

  // Handle agent-dispatched UI actions
  useEffect(() => {
    if (!pendingAction)
      return
    switch (pendingAction.type) {
      case 'switch_tab': {
        const tab = pendingAction.payload?.tab as string | undefined
        if (tab === 'workbook')
          setCompanionTab('workbook')
        else if (tab === 'companion' || tab === 'ai')
          setCompanionTab('ai')
        // transcript and study are in the left panel — no tab state to switch here
        break
      }
      case 'navigate_to_segment': {
        const idx = pendingAction.payload?.segmentIndex as number | undefined
        if (idx !== undefined && segments[idx] && player) {
          player.seekTo(segments[idx].start)
          player.play()
        }
        break
      }
      case 'start_shadowing': {
        const idx = pendingAction.payload?.segmentIndex as number | undefined
        const startIdx = idx !== undefined && segments[idx] ? idx : segments.findIndex(s => activeSegment && s.id === activeSegment.id)
        const resolvedIdx = startIdx >= 0 ? startIdx : 0
        if (segments[resolvedIdx]) {
          setPickerSegment(segments[resolvedIdx])
        }
        break
      }
      case 'play_segment_audio': {
        const idx = pendingAction.payload?.segmentIndex as number | undefined
        if (idx !== undefined && segments[idx] && player) {
          playSegmentStopAtRef.current = segments[idx].end
          player.seekTo(segments[idx].start)
          player.play()
        }
        break
      }
    }
    clearAction()
  }, [pendingAction, clearAction, segments, player, activeSegment])

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
    if (!dbRef.current || !metaRef.current)
      return
    pendingSegmentIdRef.current = segmentId
    if (progressDebounceRef.current)
      clearTimeout(progressDebounceRef.current)
    progressDebounceRef.current = setTimeout(() => {
      if (dbRef.current && metaRef.current) {
        saveLessonMeta(dbRef.current, { ...metaRef.current, progressSegmentId: segmentId })
      }
      pendingSegmentIdRef.current = null
    }, 500)
  }, []) // stable — reads live values through refs

  // Flush pending progress write immediately on unmount.
  // Handles SPA navigation away from the lesson within the 500ms debounce window.
  // Does NOT protect against hard tab close or browser crash — those kill the process before cleanup runs.
  // Empty deps intentional — reads live values through refs.
  useEffect(() => {
    return () => {
      if (progressDebounceRef.current && pendingSegmentIdRef.current && dbRef.current && metaRef.current) {
        clearTimeout(progressDebounceRef.current)
        void saveLessonMeta(dbRef.current, { ...metaRef.current, progressSegmentId: pendingSegmentIdRef.current })
      }
    }
  }, [])

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
    = typeof MediaRecorder !== 'undefined'
      && getLanguageCaps(meta?.sourceLanguage).azurePronunciationLocale !== null

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

  // Restore progress: seek to saved segment when player + segments + meta are all ready.
  // hasRestoredRef prevents re-seeking on subsequent re-renders within the same mount.
  useEffect(() => {
    if (hasRestoredRef.current || deepLinkSegmentId || !player || !db || !meta || segments.length === 0)
      return
    if (!meta.progressSegmentId) {
      hasRestoredRef.current = true
      return
    }
    const target = segments.find(s => s.id === meta.progressSegmentId)
    if (!target) {
      // EC2: orphaned segment ID — clear it from IDB and start at beginning
      saveLessonMeta(db, { ...meta, progressSegmentId: null })
      hasRestoredRef.current = true
      return
    }
    player.seekTo(target.start)
    hasRestoredRef.current = true
  }, [player, meta, segments, db, deepLinkSegmentId])

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
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left section: video and transcript/shadowing */}
      <div className="flex flex-col 2xl:flex-row h-full w-[60%] 2xl:w-3/4 overflow-hidden border-r border-border">
        {/* Video Panel — 50% height on small, 50% width on 2xl */}
        <div className="h-1/2 2xl:h-full w-full 2xl:w-1/2 shrink-0 overflow-hidden border-b 2xl:border-b-0 2xl:border-r border-border">
          <VideoPanel
            lesson={meta}
            segments={segments}
            activeSegment={activeSegment}
            videoBlob={videoBlob}
            onRename={handleRename}
          />
        </div>

        {/* Transcript / Shadowing Panel — flex-1 fills remaining space */}
        <div className="flex-1 overflow-hidden">
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
      </div>

      {/* Companion Panel — flex-1 fills remaining width */}
      <div className="h-full flex-1 overflow-hidden">
        <CompanionPanel
          activeSegment={activeSegment}
          lessonId={id ?? ''}
          lessonTitle={meta.title}
          activeTab={companionTab}
          onTabChange={setCompanionTab}
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

export function LessonView() {
  const { id } = useParams<{ id: string }>()
  return (
    <AgentActionsProvider>
      <LessonViewContent key={id} />
    </AgentActionsProvider>
  )
}
