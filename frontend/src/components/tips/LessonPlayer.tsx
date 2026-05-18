import { useEffect, useRef } from 'react'
import { publishTime, registerSeek } from '@/lib/tipPlayerStore'

interface YTPlayer {
  destroy: () => void
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (sec: number, allowSeekAhead: boolean) => void
  playVideo: () => void
}

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

const SCRIPT_ID = 'youtube-iframe-api'

function ensureApi(): Promise<void> {
  if (window.YT && window.YT.Player)
    return Promise.resolve()
  return new Promise((resolve) => {
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script')
      s.id = SCRIPT_ID
      s.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(s)
    }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
  })
}

interface Props {
  videoId: string
  resumeSec?: number
  onTimeUpdate?: (currentSec: number, durationSec: number) => void
  onEnded?: () => void
}

export function LessonPlayer({ videoId, resumeSec, onTimeUpdate, onEnded }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let destroyed = false
    void ensureApi().then(() => {
      if (destroyed || !hostRef.current)
        return
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: { autoplay: 1, modestbranding: 1, rel: 0, start: resumeSec ?? 0 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === 0)
              onEnded?.()
          },
        },
      })
      registerSeek((sec) => { playerRef.current?.seekTo(sec, true) })
      intervalRef.current = setInterval(() => {
        if (!playerRef.current)
          return
        try {
          const cur = playerRef.current.getCurrentTime()
          const dur = playerRef.current.getDuration()
          if (Number.isFinite(cur) && Number.isFinite(dur) && dur > 0) {
            onTimeUpdate?.(cur, dur)
            publishTime(cur)
          }
        }
        catch {
          // noop
        }
      }, 1000)
    })
    return () => {
      destroyed = true
      if (intervalRef.current)
        clearInterval(intervalRef.current)
      registerSeek(null)
      try {
        playerRef.current?.destroy()
      }
      catch {
        // noop
      }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return (
    <div className="aspect-video bg-black border border-border rounded-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <div ref={hostRef} className="size-full" />
    </div>
  )
}
