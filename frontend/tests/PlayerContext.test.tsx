import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProvider, usePlayer } from '../src/contexts/PlayerContext'
import type { VideoPlayer } from '../src/player/types'

function makePlayer(overrides: Partial<VideoPlayer> = {}): VideoPlayer {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
    onTimeUpdate: vi.fn(() => () => {}),
    onEnded: vi.fn(() => () => {}),
    onPlay: vi.fn(() => () => {}),
    onPause: vi.fn(() => () => {}),
    destroy: vi.fn(),
    ...overrides,
  }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlayerProvider>{children}</PlayerProvider>
)

describe('playerContext volume', () => {
  it('initializes volume to 1', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper })
    expect(result.current.volume).toBe(1)
  })

  it('setVolume updates state and calls player.setVolume', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(0.4) })

    expect(result.current.volume).toBe(0.4)
    expect(player.setVolume).toHaveBeenCalledWith(0.4)
  })

  it('setVolume clamps values above 1', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(2) })

    expect(result.current.volume).toBe(1)
    expect(player.setVolume).toHaveBeenCalledWith(1)
  })

  it('setVolume clamps values below 0', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => { result.current.setPlayer(player) })
    act(() => { result.current.setVolume(-0.5) })

    expect(result.current.volume).toBe(0)
    expect(player.setVolume).toHaveBeenCalledWith(0)
  })
})
