export interface VideoPlayer {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  onTimeUpdate: (callback: (currentTime: number) => void) => () => void
  onEnded: (callback: () => void) => () => void
  onPlay: (callback: () => void) => () => void
  onPause: (callback: () => void) => () => void
  destroy: () => void
}
