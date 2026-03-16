import type { VideoPlayer } from '../src/player/types'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProvider, usePlayer } from '../src/contexts/PlayerContext'

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

function wrapper({ children }: { children: React.ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>
}

describe('playerContext subscribeTime / getTime', () => {
  it('getTime returns 0 before any player is set', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper })
    expect(result.current.getTime()).toBe(0)
  })

  it('subscribeTime delivers time ticks fired by the player', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => {
        fireTime = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })

    const received: number[] = []
    act(() => { result.current.subscribeTime(t => received.push(t)) })

    act(() => { fireTime!(1.5) })
    act(() => { fireTime!(2.0) })

    expect(received).toEqual([1.5, 2.0])
  })

  it('getTime returns the most recent time tick', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => { fireTime = cb; return () => {} }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })
    act(() => { fireTime!(42.5) })
    expect(result.current.getTime()).toBe(42.5)
  })

  it('subscribeTime cleanup removes the subscriber', () => {
    let fireTime: ((t: number) => void) | null = null
    const player = makePlayer({
      onTimeUpdate: vi.fn((cb) => { fireTime = cb; return () => {} }),
    })
    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player) })

    const received: number[] = []
    let unsub!: () => void
    act(() => { unsub = result.current.subscribeTime(t => received.push(t)) })
    act(() => { fireTime!(1.0) })
    act(() => { unsub() })
    act(() => { fireTime!(2.0) })

    expect(received).toEqual([1.0])
  })

  it('survives player swap — subscribers receive ticks from new player', () => {
    let fire1: ((t: number) => void) | null = null
    let fire2: ((t: number) => void) | null = null
    const player1 = makePlayer({ onTimeUpdate: vi.fn(cb => { fire1 = cb; return () => {} }) })
    const player2 = makePlayer({ onTimeUpdate: vi.fn(cb => { fire2 = cb; return () => {} }) })

    const { result } = renderHook(() => usePlayer(), { wrapper })
    act(() => { result.current.setPlayer(player1) })

    const received: number[] = []
    act(() => { result.current.subscribeTime(t => received.push(t)) })

    act(() => { fire1!(1.0) })
    act(() => { result.current.setPlayer(player2) })
    act(() => { fire2!(2.0) })

    expect(received).toEqual([1.0, 2.0])
  })
})

describe('playerContext volume', () => {
  it('initializes volume to 1', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper })
    expect(result.current.volume).toBe(1)
  })

  it('setVolume updates state and calls player.setVolume', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => {
      result.current.setPlayer(player)
    })
    act(() => {
      result.current.setVolume(0.4)
    })

    expect(result.current.volume).toBe(0.4)
    expect(player.setVolume).toHaveBeenCalledWith(0.4)
  })

  it('setVolume clamps values above 1', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => {
      result.current.setPlayer(player)
    })
    act(() => {
      result.current.setVolume(2)
    })

    expect(result.current.volume).toBe(1)
    expect(player.setVolume).toHaveBeenCalledWith(1)
  })

  it('setVolume clamps values below 0', () => {
    const player = makePlayer()
    const { result } = renderHook(() => usePlayer(), { wrapper })

    act(() => {
      result.current.setPlayer(player)
    })
    act(() => {
      result.current.setVolume(-0.5)
    })

    expect(result.current.volume).toBe(0)
    expect(player.setVolume).toHaveBeenCalledWith(0)
  })
})
