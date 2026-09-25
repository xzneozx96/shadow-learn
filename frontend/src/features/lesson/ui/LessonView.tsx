import type { Segment } from '@/shared/types'
import { Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { usePlayer } from '@/app/providers/PlayerContext'
import { updateLessonMeta } from '@/db'
import { AgentActionsProvider, useAgentActions } from '@/features/agent/application/AgentActionsContext'
import { CompanionPanel } from '@/features/agent/ui/CompanionPanel'
import { useLessons } from '@/features/lesson/application/LessonsContext'
import { useActiveSegment } from '@/features/lesson/application/useActiveSegment'
import { useLesson } from '@/features/lesson/application/useLesson'
import { ShadowingModePicker } from '@/features/shadowing/ui/ShadowingModePicker'
import { ShadowingPanel } from '@/features/shadowing/ui/ShadowingPanel'
import { useStudyQueueContext } from '@/features/study/application/StudyQueueContext'
import { useSpeakingBests } from '@/shared/hooks/useSpeakingBests'
import { useTimeEffect } from '@/shared/hooks/useTimeEffect'
import { getLanguageCaps } from '@/shared/lib/language-caps'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent } from '@/shared/ui/dialog'
import { TranscriptPanel } from './TranscriptPanel'
import { VideoPanel } from './VideoPanel'

function LessonViewContent() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const { db } = useAuth()
  const { player } = usePlayer()
  const { renameLesson } = useLessons()
  const { meta, segments, media, loading, error, updateMeta } = useLesson(db, id)
  const activeSegment = useActiveSegment(segments)
  const { bests, getBest, saveBest, getAudio } = useSpeakingBests(id ?? '')
  const { refresh: refreshQueue } = useStudyQueueContext()

  type ShadowingActiveMode = null | { mode: 'dictation' | 'speaking', segments: Segment[] }
  const [shadowingMode, setShadowingMode] = useState<ShadowingActiveMode>(null)
  const [pickerSegment, setPickerSegment] = useState<Segment | null>(null)
  const [companionTab, setCompanionTab] = useState('ai')
  const [mobilePanel, setMobilePanel] = useState<'transcript' | 'companion'>('transcript')

  const handleMobileTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'transcript' : 'companion'
    setMobilePanel(next)
    document.getElementById(`lesson-${next}-tab`)?.focus()
  }

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

  // State updates from agent-dispatched actions (setState-during-render)
  const [lastAction, setLastAction] = useState(pendingAction)
  if (lastAction !== pendingAction) {
    setLastAction(pendingAction)
    if (pendingAction?.type === 'switch_tab') {
      const tab = pendingAction.payload?.tab as string | undefined
      if (tab === 'workbook')
        setCompanionTab('workbook')
      else if (tab === 'companion' || tab === 'ai')
        setCompanionTab('ai')
      if (tab === 'workbook' || tab === 'companion' || tab === 'ai')
        setMobilePanel('companion')
    }
    else if (pendingAction?.type === 'start_shadowing') {
      const idx = pendingAction.payload?.segmentIndex as number | undefined
      const startIdx = idx !== undefined && segments[idx] ? idx : segments.findIndex(s => activeSegment && s.id === activeSegment.id)
      const resolvedIdx = startIdx >= 0 ? startIdx : 0
      if (segments[resolvedIdx])
        setPickerSegment(segments[resolvedIdx])
    }
  }

  // Imperative side effects (player calls, ref mutation) + clear action
  useEffect(() => {
    if (!pendingAction)
      return
    if (pendingAction.type === 'navigate_to_segment') {
      const idx = pendingAction.payload?.segmentIndex as number | undefined
      if (idx !== undefined && segments[idx] && player) {
        player.seekTo(segments[idx].start)
        player.play()
      }
    }
    else if (pendingAction.type === 'play_segment_audio') {
      const idx = pendingAction.payload?.segmentIndex as number | undefined
      if (idx !== undefined && segments[idx] && player) {
        playSegmentStopAtRef.current = segments[idx].end
        player.seekTo(segments[idx].start)
        player.play()
      }
    }
    clearAction()
  }, [pendingAction, clearAction, segments, player])

  const handleSegmentClick = useCallback((segment: { start: number }) => {
    if (!player)
      return
    player.seekTo(segment.start)
    player.play()
  }, [player])

  const handleProgressUpdate = useCallback((segmentId: string) => {
    if (!dbRef.current || !metaRef.current || !hasRestoredRef.current)
      return
    pendingSegmentIdRef.current = segmentId
    if (progressDebounceRef.current)
      clearTimeout(progressDebounceRef.current)
    progressDebounceRef.current = setTimeout(() => {
      if (dbRef.current && metaRef.current) {
        updateLessonMeta(dbRef.current, metaRef.current, prev => ({ ...prev, progressSegmentId: segmentId }))
          .then(saved => updateMeta({ version: saved.version }))
      }
      pendingSegmentIdRef.current = null
    }, 500)
  }, [updateMeta])

  // Flush pending progress write immediately on unmount.
  // Handles SPA navigation away from the lesson within the 500ms debounce window.
  // Does NOT protect against hard tab close or browser crash — those kill the process before cleanup runs.
  // Empty deps intentional — reads live values through refs.
  useEffect(() => {
    return () => {
      if (progressDebounceRef.current && pendingSegmentIdRef.current && dbRef.current && metaRef.current) {
        clearTimeout(progressDebounceRef.current)
        const segmentId = pendingSegmentIdRef.current
        void updateLessonMeta(dbRef.current, metaRef.current, prev => ({ ...prev, progressSegmentId: segmentId }))
      }
    }
  }, [])

  const handleRename = useCallback(async (newTitle: string) => {
    if (!meta)
      return
    await renameLesson(meta, newTitle)
    updateMeta({ title: newTitle })
  }, [meta, renameLesson, updateMeta])

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
    void refreshQueue()
  }, [refreshQueue])

  const speakingAvailable
    = typeof MediaRecorder !== 'undefined'
      && getLanguageCaps(meta?.sourceLanguage).azurePronunciationLocale !== null

  const location = useLocation()
  const roleplaySystemPrompt = (location.state as { roleplaySystemPrompt?: string } | null)?.roleplaySystemPrompt

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
    hasRestoredRef.current = true
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
      updateLessonMeta(db, meta, prev => ({ ...prev, progressSegmentId: null }))
        .then(saved => updateMeta({ version: saved.version }))
      hasRestoredRef.current = true
      return
    }
    player.seekTo(target.start)
    hasRestoredRef.current = true
  }, [player, meta, segments, db, deepLinkSegmentId, updateMeta])

  // Loading state
  if (loading) {
    return (
      <motion.div
        className="flex h-screen items-center justify-center glass-bg"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </motion.div>
    )
  }

  // Error state
  if (error || !meta) {
    return (
      <motion.div
        className="flex h-screen flex-col items-center justify-center gap-4 glass-bg"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-sm text-red-400">{error ?? t('lesson.notFound')}</p>
        <Button variant="outline" nativeButton={false} className="active:scale-[0.97] transition-transform" render={<Link to="/" />}>
          {t('lesson.backToLibrary')}
        </Button>
      </motion.div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background animate-fade-in lg:flex-row">
      {/* Left section: video and transcript/shadowing */}
      <div className={cn(
        'flex min-w-0 flex-col overflow-hidden lg:h-full lg:w-[60%] lg:border-r lg:border-border 2xl:w-3/4 2xl:flex-row',
        mobilePanel === 'transcript' ? 'min-h-0 flex-1' : 'shrink-0',
      )}
      >
        <div className="w-full shrink-0 overflow-hidden border-b border-border lg:h-1/2 2xl:h-full 2xl:w-1/2 2xl:border-r 2xl:border-b-0">
          <VideoPanel
            lesson={meta}
            segments={segments}
            activeSegment={activeSegment}
            media={media}
            onRename={handleRename}
          />
        </div>

        <div className="flex shrink-0 border-b border-border lg:hidden" role="tablist" aria-label={`${t('lesson.transcript')} / ${t('lesson.companion')}`}>
          <button
            id="lesson-transcript-tab"
            type="button"
            role="tab"
            aria-selected={mobilePanel === 'transcript'}
            aria-controls="lesson-transcript-panel"
            tabIndex={mobilePanel === 'transcript' ? 0 : -1}
            className={cn(
              'min-h-11 flex-1 border-b-2 px-3 text-sm font-medium transition-colors',
              mobilePanel === 'transcript' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setMobilePanel('transcript')}
            onKeyDown={handleMobileTabKeyDown}
          >
            {t('lesson.transcript')}
          </button>
          <button
            id="lesson-companion-tab"
            type="button"
            role="tab"
            aria-selected={mobilePanel === 'companion'}
            aria-controls="lesson-companion-panel"
            tabIndex={mobilePanel === 'companion' ? 0 : -1}
            className={cn(
              'min-h-11 flex-1 border-b-2 px-3 text-sm font-medium transition-colors',
              mobilePanel === 'companion' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setMobilePanel('companion')}
            onKeyDown={handleMobileTabKeyDown}
          >
            {t('lesson.companion')}
          </button>
        </div>

        {/* Transcript / Shadowing Panel — flex-1 fills remaining space */}
        <div
          id="lesson-transcript-panel"
          role="tabpanel"
          aria-labelledby="lesson-transcript-tab"
          className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', mobilePanel === 'companion' && 'hidden lg:block')}
        >
          {shadowingMode
            ? (
                <ShadowingPanel
                  segments={shadowingMode.segments}
                  mode={shadowingMode.mode}
                  onExit={handleShadowingExit}
                  lesson={meta}
                  getBest={getBest}
                  saveBest={saveBest}
                  getAudio={getAudio}
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
                  speakingBests={bests}
                  activeMobilePanel={mobilePanel}
                />
              )}
        </div>
      </div>

      {/* Companion Panel — flex-1 fills remaining width */}
      <div
        id="lesson-companion-panel"
        role="tabpanel"
        aria-labelledby="lesson-companion-tab"
        className={cn('min-h-0 min-w-0 flex-1 overflow-hidden lg:h-full', mobilePanel === 'transcript' && 'hidden lg:block')}
      >
        <CompanionPanel
          activeSegment={activeSegment}
          lessonId={id ?? ''}
          lessonTitle={meta.title}
          activeTab={companionTab}
          onTabChange={setCompanionTab}
          roleplaySystemPrompt={roleplaySystemPrompt}
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
