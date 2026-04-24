import type { VideoPlayer } from './types'

export class HTML5Player implements VideoPlayer {
  private element: HTMLVideoElement | HTMLAudioElement
  private timeUpdateCallbacks: Array<(time: number) => void> = []
  private endedCallbacks: Array<() => void> = []
  private playCallbacks: Array<() => void> = []
  private pauseCallbacks: Array<() => void> = []
  private rafId: number | null = null

  constructor(element: HTMLVideoElement | HTMLAudioElement) {
    this.element = element
    this.element.addEventListener('ended', this.handleEnded)
    this.element.addEventListener('play', this.handlePlay)
    this.element.addEventListener('pause', this.handlePause)
    this.startTimeUpdateLoop()
  }

  play(): void {
    this.element.play()
  }

  pause(): void {
    this.element.pause()
  }

  seekTo(seconds: number): void {
    this.element.currentTime = seconds
  }

  getCurrentTime(): number {
    return this.element.currentTime
  }

  getDuration(): number {
    return this.element.duration || 0
  }

  setPlaybackRate(rate: number): void {
    this.element.playbackRate = rate
  }

  setVolume(volume: number): void {
    this.element.volume = Math.max(0, Math.min(1, volume))
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
    }
    this.element.removeEventListener('ended', this.handleEnded)
    this.element.removeEventListener('play', this.handlePlay)
    this.element.removeEventListener('pause', this.handlePause)
    this.timeUpdateCallbacks = []
    this.endedCallbacks = []
    this.playCallbacks = []
    this.pauseCallbacks = []
  }

  private startTimeUpdateLoop(): void {
    const tick = () => {
      const time = this.element.currentTime
      for (const cb of this.timeUpdateCallbacks) {
        cb(time)
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private handleEnded = (): void => {
    for (const cb of this.endedCallbacks) {
      cb()
    }
  }

  private handlePlay = (): void => {
    for (const cb of this.playCallbacks) {
      cb()
    }
  }

  private handlePause = (): void => {
    for (const cb of this.pauseCallbacks) {
      cb()
    }
  }
}
