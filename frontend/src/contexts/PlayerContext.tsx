import type { ReactNode } from 'react'
import type { VideoPlayer } from '../player/types'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

interface PlayerState {
  player: VideoPlayer | null
  playbackRate: number
  volume: number
  setPlayer: (player: VideoPlayer) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (v: number) => void
  subscribeTime: (cb: (t: number) => void) => () => void
  getTime: () => number
}

const PlayerContext = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer_] = useState<VideoPlayer | null>(null)
  const [playbackRate, setPlaybackRate_] = useState(1)
  const [volume, setVolume_] = useState(1)

  const timeRef = useRef(0)
  const subscribersRef = useRef<Set<(t: number) => void>>(new Set())
  const unsubRef = useRef<(() => void) | null>(null)

  // Fan-out: wire current player's onTimeUpdate to all subscribers
  useEffect(() => {
    if (!player) return
    if (unsubRef.current) unsubRef.current()
    unsubRef.current = player.onTimeUpdate((time) => {
      timeRef.current = time
      for (const cb of subscribersRef.current) cb(time)
    })
    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [player])

  const setPlayer = useCallback((newPlayer: VideoPlayer) => {
    setPlayer_(newPlayer)
  }, [])

  const subscribeTime = useCallback((cb: (t: number) => void) => {
    subscribersRef.current.add(cb)
    return () => { subscribersRef.current.delete(cb) }
  }, [])

  const getTime = useCallback(() => timeRef.current, [])

  const setPlaybackRate = useCallback(
    (rate: number) => {
      player?.setPlaybackRate(rate)
      setPlaybackRate_(rate)
    },
    [player],
  )

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v))
      player?.setVolume(clamped)
      setVolume_(clamped)
    },
    [player],
  )

  return (
    <PlayerContext
      value={{ player, playbackRate, volume, setPlayer, setPlaybackRate, setVolume, subscribeTime, getTime }}
    >
      {children}
    </PlayerContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): PlayerState {
  const ctx = use(PlayerContext)
  if (!ctx)
    throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
