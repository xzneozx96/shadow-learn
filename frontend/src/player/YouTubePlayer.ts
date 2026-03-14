import type { VideoPlayer } from './types'

interface YTPlayerOptions {
  videoId: string
  playerVars?: Record<string, number | string>
  events?: {
    onReady?: () => void
    onStateChange?: (event: { data: number }) => void
  }
}

interface YTPlayerInstance {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  destroy: () => void
}

interface YTNamespace {
  Player: new (containerId: string, options: YTPlayerOptions) => YTPlayerInstance
  PlayerState: { ENDED: number }
}

declare global {
  interface Window {
    YT: YTNamespace
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
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(containerId: string, videoId: string) {
    void this.init(containerId, videoId)
  }

  private async init(containerId: string, videoId: string): Promise<void> {
    await loadYouTubeAPI()

    return new Promise<void>((resolve) => {
      this.player = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
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

  destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
    }
    this.player?.destroy()
    this.timeUpdateCallbacks = []
    this.endedCallbacks = []
  }

  private startTimeUpdateLoop(): void {
    this.intervalId = setInterval(() => {
      const time = this.getCurrentTime()
      for (const cb of this.timeUpdateCallbacks) {
        cb(time)
      }
    }, 100)
  }
}
