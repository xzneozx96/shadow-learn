import type { ReactNode } from 'react'
import type { VideoPlayer } from '../player/types'
import {
  createContext,
  use,
  useCallback,
  useRef,
  useState,

} from 'react'

interface PlayerState {
  player: VideoPlayer | null
  currentTime: number
  playbackRate: number
  volume: number
  setPlayer: (player: VideoPlayer) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (v: number) => void
}

const PlayerContext = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer_] = useState<VideoPlayer | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate_] = useState(1)
  const [volume, setVolume_] = useState(1)
  const unsubRef = useRef<(() => void) | null>(null)

  const setPlayer = useCallback((newPlayer: VideoPlayer) => {
    if (unsubRef.current) {
      unsubRef.current()
    }

    const unsub = newPlayer.onTimeUpdate((time) => {
      setCurrentTime(time)
    })
    unsubRef.current = unsub
    setPlayer_(newPlayer)
  }, [])

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
      value={{ player, currentTime, playbackRate, volume, setPlayer, setPlaybackRate, setVolume }}
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
