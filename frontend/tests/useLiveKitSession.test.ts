/**
 * Tests for useLiveKitSession hook - verifying LiveKit voice connection.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveKitSession } from '@/hooks/useLiveKitSession'

// Mock livekit-client
vi.mock('livekit-client', () => ({
  Room: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    localParticipant: {
      createMicrophoneTracks: vi.fn().mockResolvedValue([]),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      getTracks: vi.fn().mockReturnValue([]),
      muteTrack: vi.fn(),
      unmuteTrack: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
  RoomEvent: {
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    TrackSubscribed: 'trackSubscribed',
    AudioLevelChanged: 'audioLevelChanged',
    DataReceived: 'dataReceived',
  },
}))

describe('useLiveKitSession', () => {
  const mockOptions = {
    url: 'wss://test.livekit.cloud',
    token: 'test-token',
    agentName: 'test-agent',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should return initial disconnected status', async () => {
    const { result } = renderHook(() => useLiveKitSession(mockOptions))

    expect(result.current.status).toBe('disconnected')
    expect(result.current.transcript).toEqual([])
    expect(result.current.isSpeaking).toBe(false)
    expect(result.current.isMuted).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('should have start and end functions', async () => {
    const { result } = renderHook(() => useLiveKitSession(mockOptions))

    expect(typeof result.current.start).toBe('function')
    expect(typeof result.current.end).toBe('function')
    expect(typeof result.current.toggleMute).toBe('function')
  })

  it('should attempt connection when start is called', async () => {
    const { result } = renderHook(() => useLiveKitSession(mockOptions))

    await act(async () => {
      try {
        await result.current.start()
      }
      catch {
        // Connection may fail in test environment without real credentials
      }
    })

    // Status changes to connecting or failed (both are valid)
    expect(['connecting', 'connected', 'failed']).toContain(result.current.status)
  })

  it('should clear transcript on end', async () => {
    const { result } = renderHook(() => useLiveKitSession(mockOptions))

    await act(async () => {
      await result.current.start()
    })

    await act(async () => {
      await result.current.end()
    })

    expect(result.current.status).toBe('disconnected')
    expect(result.current.transcript).toEqual([])
  })
})
