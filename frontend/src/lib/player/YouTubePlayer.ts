import type { VideoPlayer } from './types'

interface YTPlayerInstance {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  getVolume: () => number
  destroy: () => void
}

declare global {
  interface Window {
    YT: {
      Player: new (containerId: string, options: {
        videoId: string
        width?: string | number
        height?: string | number
        playerVars?: Record<string, number | string>
        events?: {
          onReady?: () => void
          onStateChange?: (event: { data: number }) => void
        }
      }) => YTPlayerInstance
      PlayerState: { ENDED: number, PLAYING: number, PAUSED: number }
    }
    onYouTubeIframeAPIReady: () => void
  }
}

let apiLoaded = false
let apiLoadPromise: Promise<void> | null = null

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded)
    return Promise.resolve()
  if (apiLoadPromise)
    return apiLoadPromise

  apiLoadPromise = new Promise<void>((resolve) => {
    // Check if already loaded (e.g. from a previous session)
    if (window.YT?.Player) {
      apiLoaded = true
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true
      resolve()
    }
    document.head.appendChild(script)
  })

  return apiLoadPromise
}

export class YouTubePlayer implements VideoPlayer {
  private player: YTPlayerInstance | null = null
  private timeUpdateCallbacks: Array<(time: number) => void> = []
  private endedCallbacks: Array<() => void> = []
  private playCallbacks: Array<() => void> = []
  private pauseCallbacks: Array<() => void> = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  readonly ready: Promise<void>

  constructor(containerId: string, videoId: string) {
    this.ready = this.init(containerId, videoId)
  }

  private async init(containerId: string, videoId: string): Promise<void> {
    await loadYouTubeAPI()

    return new Promise<void>((resolve) => {
      this.player = new window.YT.Player(containerId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.startTimeUpdateLoop()
            resolve()
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              for (const cb of this.endedCallbacks) cb()
            }
            else if (event.data === window.YT.PlayerState.PLAYING) {
              for (const cb of this.playCallbacks) cb()
            }
            else if (event.data === window.YT.PlayerState.PAUSED) {
              for (const cb of this.pauseCallbacks) cb()
            }
          },
        },
      })
    })
  }

  play(): void {
    this.player?.playVideo()
  }

  pause(): void {
    this.player?.pauseVideo()
  }

  seekTo(seconds: number): void {
    this.player?.seekTo(seconds, true)
  }

  getCurrentTime(): number {
    return this.player?.getCurrentTime() ?? 0
  }

  getDuration(): number {
    return this.player?.getDuration() ?? 0
  }

  setPlaybackRate(rate: number): void {
    this.player?.setPlaybackRate(rate)
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume))
    this.player?.setVolume(Math.round(clamped * 100))
  }

  onTimeUpdate(callback: (currentTime: number) => void): () => void {
    this.timeUpdateCallbacks.push(callback)
    return () => {
      this.timeUpdateCallbacks = this.timeUpdateCallbacks.filter(cb => cb !== callback)
    }
  }

  onEnded(callback: () => void): () => void {
    this.endedCallbacks.push(callback)
    return () => {
      this.endedCallbacks = this.endedCallbacks.filter(cb => cb !== callback)
    }
  }

  onPlay(callback: () => void): () => void {
    this.playCallbacks.push(callback)
    return () => {
      this.playCallbacks = this.playCallbacks.filter(cb => cb !== callback)
    }
  }

  onPause(callback: () => void): () => void {
    this.pauseCallbacks.push(callback)
    return () => {
      this.pauseCallbacks = this.pauseCallbacks.filter(cb => cb !== callback)
    }
  }

  destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
    }
    this.player?.destroy()
    this.timeUpdateCallbacks = []
    this.endedCallbacks = []
    this.playCallbacks = []
    this.pauseCallbacks = []
  }

  private startTimeUpdateLoop(): void {
    this.intervalId = setInterval(() => {
      if (!this.player)
        return
      try {
        const time = this.player.getCurrentTime()
        for (const cb of this.timeUpdateCallbacks) {
          cb(time)
        }
      }
      catch {
        // player not ready yet
      }
    }, 100)
  }
}
