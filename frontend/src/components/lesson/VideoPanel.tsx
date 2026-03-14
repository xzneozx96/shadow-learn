import type { LessonMeta, Segment } from '@/types'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/contexts/PlayerContext'
import { cn } from '@/lib/utils'
import { HTML5Player } from '@/player/HTML5Player'
import { YouTubePlayer } from '@/player/YouTubePlayer'

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1)
    }
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v')
    }
  }
  catch {
    // invalid URL
  }
  return null
}

interface VideoPanelProps {
  lesson: LessonMeta
  segments: Segment[]
  activeSegment: Segment | null
  videoBlob?: Blob
}

export function VideoPanel({ lesson, segments, activeSegment, videoBlob }: VideoPanelProps) {
  const { player, currentTime, playbackRate, setPlayer, setPlaybackRate } = usePlayer()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  // Initialize player
  useEffect(() => {
    let destroyed = false

    if (lesson.source === 'youtube' && lesson.sourceUrl) {
      const videoId = extractYouTubeVideoId(lesson.sourceUrl)
      if (!videoId)
        return

      const ytPlayer = new YouTubePlayer('yt-player', videoId)
      if (!destroyed) {
        setPlayer(ytPlayer)
      }

      return () => {
        destroyed = true
        ytPlayer.destroy()
      }
    }

    if (lesson.source === 'upload' && videoBlob && videoRef.current) {
      const objectUrl = URL.createObjectURL(videoBlob)
      videoRef.current.src = objectUrl
      const h5Player = new HTML5Player(videoRef.current)
      if (!destroyed) {
        setPlayer(h5Player)
      }

      return () => {
        destroyed = true
        h5Player.destroy()
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [lesson.source, lesson.sourceUrl, videoBlob, setPlayer])

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

  // Track ended
  useEffect(() => {
    if (!player)
      return
    const unsub = player.onEnded(() => {
      setIsPlaying(false)
    })
    return unsub
  }, [player])

  const togglePlayPause = () => {
    if (!player)
      return
    if (isPlaying) {
      player.pause()
    }
    else {
      player.play()
    }
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
    const prev = segments[activeIndex - 1]
    player.seekTo(prev.start)
    if (!isPlaying) {
      player.play()
      setIsPlaying(true)
    }
  }

  const jumpNext = () => {
    if (!player || activeIndex < 0 || activeIndex >= segments.length - 1)
      return
    const next = segments[activeIndex + 1]
    player.seekTo(next.start)
    if (!isPlaying) {
      player.play()
      setIsPlaying(true)
    }
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!player)
      return
    const time = Number(e.target.value)
    player.seekTo(time)
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Video area */}
      <div className="relative flex-1 bg-black">
        {lesson.source === 'youtube'
          ? (
              <div id="yt-player" className="size-full" />
            )
          : (
              <video
                ref={videoRef}
                className="size-full object-contain"
                playsInline
              />
            )}
      </div>

      {/* Controls */}
      <div className="space-y-2 border-t border-slate-800 px-3 py-2">
        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          className="h-1 w-full cursor-pointer accent-blue-500"
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
          <span className="font-mono text-xs text-slate-400">
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
                  playbackRate === rate && 'text-blue-400',
                )}
              >
                {rate}
                x
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-2 border-t border-slate-800 px-3 py-1.5">
        <span className="truncate text-sm font-medium text-slate-200">
          {lesson.title}
        </span>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {lesson.segmentCount}
          {' '}
          segments
        </Badge>
        <Badge variant="outline" className="shrink-0 text-xs">
          {formatTime(lesson.duration)}
        </Badge>
      </div>
    </div>
  )
}
