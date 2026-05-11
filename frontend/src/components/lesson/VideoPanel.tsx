import type { LessonMeta, Segment } from '@/types'
import { Download, ExternalLink, Home, Pause, Pencil, Play, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { usePlayer } from '@/contexts/PlayerContext'
import { HTML5Player } from '@/lib/player/HTML5Player'
import { cn } from '@/lib/utils'

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5]

// Ambient background videos for blog lessons — add more YouTube IDs here
const AMBIENT_VIDEOS = [
  'bBQA7yy7EBU',
  'GrG2-oX5z24',
  'BYTxPFj44uo',
  'e94hCLHEEsk',
  'vvThzcBfnyc',
  'Wo2G9740xyE',
  'AhJ9-AtFje0',
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'youtu.be')
      return parsed.pathname.slice(1)
    if (parsed.hostname.includes('youtube.com'))
      return parsed.searchParams.get('v')
  }
  catch { /* invalid URL */ }
  return null
}

/* eslint-disable react-refresh/only-export-components */
const SPACE_PATTERN = /\s+/g
const INVALID_CHAR_PATTERN = /[^\w.-]/g
const TRIM_HYPHENS_PATTERN = /^-+|-+$/g

export function sanitizeBaseName(title: string): string {
  const sanitized = title
    .replace(SPACE_PATTERN, '-')
    .replace(INVALID_CHAR_PATTERN, '')
    .replace(TRIM_HYPHENS_PATTERN, '')
    .slice(0, 100)
  return sanitized || 'lesson'
}

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
}

export function getMimeExtension(mimeType: string): string {
  const base = mimeType.split(';')[0].trim()
  return MIME_TO_EXT[base] ?? '.mp4'
}
/* eslint-enable react-refresh/only-export-components */

interface VideoPanelProps {
  lesson: LessonMeta
  segments: Segment[]
  activeSegment: Segment | null
  videoBlob?: Blob
  onRename?: (newTitle: string) => void
}

export function VideoPanel({ lesson, videoBlob, onRename }: VideoPanelProps) {
  const { t } = useI18n()
  const { player, subscribeTime, getTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume } = usePlayer()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const isCancelledRef = useRef(false)
  const titleSnapshotRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)
  const timestampRef = useRef<HTMLSpanElement>(null)
  // durationRef avoids putting `duration` in the subscribeTime effect deps, preventing
  // an unnecessary unsubscribe/resubscribe whenever duration state updates.
  const durationRef = useRef(0)

  // Auto-focus + select all when rename input appears
  useEffect(() => {
    if (isEditing)
      inputRef.current?.select()
  }, [isEditing])

  function startEditing() {
    isCancelledRef.current = false
    titleSnapshotRef.current = lesson.title
    setEditValue(lesson.title)
    setIsEditing(true)
  }

  function confirmEdit() {
    if (isCancelledRef.current)
      return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== titleSnapshotRef.current)
      onRename?.(trimmed)
    setIsEditing(false)
  }

  function cancelEdit() {
    isCancelledRef.current = true
    setIsEditing(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const isBlog = lesson.source === 'blog'
  const isAudioOnly = !isBlog && lesson.source === 'youtube' && (!videoBlob || videoBlob.type.startsWith('audio/'))
  const youtubeVideoId = lesson.sourceUrl ? extractYouTubeVideoId(lesson.sourceUrl) : null

  const [ambientIdx, setAmbientIdx] = useState(() => Math.floor(Math.random() * AMBIENT_VIDEOS.length))

  // Initialize HTML5 player for both YouTube (audio) and upload (video)
  useEffect(() => {
    if (!videoBlob || !mediaRef.current)
      return

    let destroyed = false
    const objectUrl = URL.createObjectURL(videoBlob)
    mediaRef.current.src = objectUrl

    const h5Player = new HTML5Player(mediaRef.current)
    if (!destroyed)
      setPlayer(h5Player)

    return () => {
      destroyed = true
      h5Player.destroy()
      setPlayer(null)
      URL.revokeObjectURL(objectUrl)
    }
  }, [videoBlob, setPlayer])

  // Track duration
  useEffect(() => {
    if (!player)
      return
    const interval = setInterval(() => {
      const d = player.getDuration()
      if (d > 0) {
        durationRef.current = d
        setDuration(d)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [player])

  // Track play/pause/ended
  useEffect(() => {
    if (!player)
      return
    const cleanupEnded = player.onEnded(() => setIsPlaying(false))
    const cleanupPlay = player.onPlay(() => setIsPlaying(true))
    const cleanupPause = player.onPause(() => setIsPlaying(false))

    return () => {
      cleanupEnded()
      cleanupPlay()
      cleanupPause()
    }
  }, [player])

  // Drive scrubber and timestamp display directly — no React state for currentTime.
  // `max` on the scrubber is a JSX prop — React updates it normally as `duration` state changes.
  // The timestamp span has no JSX children so React never overwrites our imperatively-set textContent.
  useEffect(() => {
    function applyTime(time: number) {
      if (scrubberRef.current)
        scrubberRef.current.value = String(time)
      if (timestampRef.current)
        timestampRef.current.textContent = `${formatTime(time)} / ${formatTime(durationRef.current)}`
    }
    applyTime(getTime()) // populate immediately on mount — no blank-flash
    return subscribeTime(applyTime)
  }, [subscribeTime, getTime])

  const togglePlayPause = () => {
    if (!player)
      return
    if (isPlaying)
      player.pause()
    else
      player.play()
    setIsPlaying(!isPlaying)
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    player?.seekTo(Number(e.target.value))
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Call player directly without triggering a React re-render during drag.
    // Context re-renders from currentTime updates would otherwise fight the slider position.
    const val = Math.round(Number(e.target.value) * 100) / 100
    player?.setVolume(val)
  }

  const handleVolumeCommit = (e: React.PointerEvent<HTMLInputElement>) => {
    const val = Math.round(Number((e.target as HTMLInputElement).value) * 100) / 100
    setVolume(val)
  }

  const handleDownload = useCallback(() => {
    if (!videoBlob)
      return
    const ext = videoBlob.type.startsWith('video/') ? getMimeExtension(videoBlob.type) : '.mp3'
    const filename = sanitizeBaseName(lesson.title) + ext
    const objectUrl = URL.createObjectURL(videoBlob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
  }, [videoBlob, lesson.title])

  return (
    <div className="flex h-full flex-col backdrop-blur-md">
      {/* Header */}
      <div className="h-[65px] flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
          <Home className="size-4" />
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="group/title flex min-w-0 flex-1 items-center gap-1">
          {isEditing
            ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={confirmEdit}
                  onKeyDown={handleRenameKeyDown}
                  className="min-w-0 flex-1 truncate rounded border border-border bg-transparent px-1 py-0.5 text-sm font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  aria-label="Rename lesson"
                />
              )
            : (
                <span className="truncate text-sm font-medium text-foreground">
                  {lesson.title}
                </span>
              )}
          {onRename && !isEditing && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={startEditing}
              aria-label="Rename lesson"
            >
              <Pencil className="size-4" />
            </Button>
          )}
        </div>
        {videoBlob && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            onClick={handleDownload}
            aria-label={videoBlob.type.startsWith('video/') ? t('lesson.downloadVideo') : t('lesson.downloadAudio')}
          >
            <Download className="size-4" />
          </Button>
        )}
      </div>

      {/* Media area */}
      <div className="relative flex-1 overflow-hidden">
        {isBlog
          ? (
              <>
                {/* Ambient looping video — decorative, not synced to lesson audio */}
                <iframe
                  key={ambientIdx}
                  className="pointer-events-none absolute inset-0 size-full scale-[1.5]"
                  src={`https://www.youtube.com/embed/${AMBIENT_VIDEOS[ambientIdx]}?autoplay=1&mute=1&loop=1&playlist=${AMBIENT_VIDEOS[ambientIdx]}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0`}
                  allow="autoplay; encrypted-media"
                  title="ambient"
                />
                {/* Click-to-toggle lesson audio */}
                <div className="absolute inset-0 cursor-pointer" onClick={togglePlayPause} />
                {/* Source domain — bottom-left */}
                {/* {lesson.sourceUrl && (
                  <a
                    href={lesson.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-4 left-3 flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm text-muted-foreground backdrop-blur-sm transition-colors duration-300 hover:text-foreground"
                  >
                    <ExternalLink className="size-3" strokeWidth={1.25} />
                    {(() => {
                      try { return new URL(lesson.sourceUrl).hostname }
                      catch { return lesson.sourceUrl }
                    })()}
                  </a>
                )} */}
                {/* Thumbnail carousel — only when multiple videos available */}
                {AMBIENT_VIDEOS.length > 1 && (
                  // Outer: full-width anchor with horizontal padding
                  <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
                    {/* Inner: scrollable pill — inline so it doesn't stretch full width */}
                    <div
                      className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-black/60 p-1.5 backdrop-blur-md"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {AMBIENT_VIDEOS.map((id, i) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setAmbientIdx(i)}
                          className={cn(
                            'shrink-0 overflow-hidden rounded-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                            i === ambientIdx
                              ? 'opacity-100 ring-2 ring-primary'
                              : 'opacity-40 hover:scale-105 hover:opacity-80',
                          )}
                          aria-label={`Ambient video ${i + 1}`}
                        >
                          <img
                            src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
                            alt=""
                            className="h-9 w-16 object-cover"
                            draggable={false}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} className="hidden" />
              </>
            )
          : isAudioOnly
            ? (
                <>
                  {/* YouTube thumbnail + link */}
                  <div className="flex size-full flex-col items-center justify-center gap-4 p-4">
                    {youtubeVideoId && (
                      <img
                        src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                        alt="Video thumbnail"
                        className="max-h-[60%] rounded-lg object-contain opacity-80"
                      />
                    )}
                    {lesson.sourceUrl && (
                      <a
                        href={lesson.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white/80"
                      >
                        <ExternalLink className="size-4" />
                        {t('lesson.openOnYouTube')}
                      </a>
                    )}
                  </div>
                  {/* Hidden audio element */}
                  <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} className="hidden" />
                </>
              )
            : (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  className="size-full cursor-pointer object-contain"
                  playsInline
                  onClick={togglePlayPause}
                />
              )}
      </div>

      {/* Controls */}
      <div className="space-y-2 border-t border-border px-3 py-2">
        {/* Scrubber */}
        <input
          ref={scrubberRef}
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          defaultValue={0}
          onChange={handleScrub}
          className="h-1 w-full cursor-pointer accent-primary"
        />

        {/* Transport controls */}
        <div className="flex items-center justify-between">
          {/* Left: play/pause + speed */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={togglePlayPause}>
              {isPlaying
                ? <Pause className="size-5" />
                : <Play className="size-5" />}
            </Button>
            {PLAYBACK_RATES.map(rate => (
              <Button
                key={rate}
                variant={playbackRate === rate ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  'min-w-8 text-sm',
                  playbackRate === rate && 'text-primary',
                )}
              >
                {rate}
                x
              </Button>
            ))}
          </div>

          {/* Right: volume + timestamp */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Volume2 className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={volume}
                onChange={handleVolumeChange}
                onPointerUp={handleVolumeCommit}
                className="h-1 w-20 cursor-pointer accent-primary"
              />
            </div>
            <span ref={timestampRef} className="font-mono text-sm text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  )
}
