import type { LessonMeta, Segment } from '@/types'
import { Download, ExternalLink, Home, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePlayer } from '@/contexts/PlayerContext'
import { cn } from '@/lib/utils'
import { HTML5Player } from '@/player/HTML5Player'

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5]

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
}

export function VideoPanel({ lesson, segments, activeSegment, videoBlob }: VideoPanelProps) {
  const { player, currentTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume } = usePlayer()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  const isAudioOnly = lesson.source === 'youtube'
  const youtubeVideoId = lesson.sourceUrl ? extractYouTubeVideoId(lesson.sourceUrl) : null

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
      URL.revokeObjectURL(objectUrl)
    }
  }, [videoBlob, setPlayer])

  // Track duration
  useEffect(() => {
    if (!player)
      return
    const interval = setInterval(() => {
      const d = player.getDuration()
      if (d > 0)
        setDuration(d)
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

  const togglePlayPause = () => {
    if (!player)
      return
    if (isPlaying)
      player.pause()
    else
      player.play()
    setIsPlaying(!isPlaying)
  }

  const activeIndex = useMemo(() => {
    if (!activeSegment)
      return -1
    return segments.findIndex(s => s.id === activeSegment.id)
  }, [activeSegment, segments])

  const jumpPrev = () => {
    if (!player || activeIndex <= 0)
      return
    player.seekTo(segments[activeIndex - 1].start)
    player.play()
  }

  const jumpNext = () => {
    if (!player || activeIndex < 0 || activeIndex >= segments.length - 1)
      return
    player.seekTo(segments[activeIndex + 1].start)
    player.play()
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    player?.seekTo(Number(e.target.value))
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Math.round(Number(e.target.value) * 100) / 100)
  }

  const handleDownload = useCallback(() => {
    if (!videoBlob)
      return
    const ext = lesson.source === 'youtube' ? '.mp3' : getMimeExtension(videoBlob.type)
    const filename = sanitizeBaseName(lesson.title) + ext
    const objectUrl = URL.createObjectURL(videoBlob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
  }, [videoBlob, lesson.title, lesson.source])

  return (
    <div className="flex h-full flex-col bg-background/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
          <Home className="size-4" />
        </Button>
        <div className="h-4 w-px bg-border" />
        <span className="truncate text-sm font-medium text-foreground">
          {lesson.title}
        </span>
        {videoBlob && (
          <TooltipProvider>
            <Tooltip>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0"
                onClick={handleDownload}
                render={<TooltipTrigger />}
              >
                <Download className="size-4" />
              </Button>
              <TooltipContent>
                {lesson.source === 'youtube' ? 'Download audio' : 'Download video'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Media area */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {isAudioOnly
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
                      className="flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white/80"
                    >
                      <ExternalLink className="size-4" />
                      Open on YouTube
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
                className="size-full object-contain"
                playsInline
              />
            )}
      </div>

      {/* Controls */}
      <div className="space-y-2 border-t border-border px-3 py-2">
        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          className="h-1 w-full cursor-pointer accent-primary"
        />

        {/* Transport controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={jumpPrev}>
              <SkipBack className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={togglePlayPause}>
              {isPlaying
                ? <Pause className="size-5" />
                : <Play className="size-5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={jumpNext}>
              <SkipForward className="size-4" />
            </Button>
          </div>

          {/* Time display */}
          <span className="font-mono text-xs text-muted-foreground">
            {formatTime(currentTime)}
            {' / '}
            {formatTime(duration)}
          </span>

          {/* Playback rate */}
          <div className="flex items-center gap-0.5">
            {PLAYBACK_RATES.map(rate => (
              <Button
                key={rate}
                variant={playbackRate === rate ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  'min-w-8 text-xs',
                  playbackRate === rate && 'text-primary',
                )}
              >
                {rate}
                x
              </Button>
            ))}
          </div>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <Volume2 className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="h-1 w-20 cursor-pointer accent-primary"
            />
          </div>
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5">
        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wider">
          {lesson.segmentCount}
          {' '}
          segments
        </Badge>
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider">
          {formatTime(lesson.duration)}
        </Badge>
        {isAudioOnly && (
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider text-primary">
            Audio
          </Badge>
        )}
      </div>
    </div>
  )
}
