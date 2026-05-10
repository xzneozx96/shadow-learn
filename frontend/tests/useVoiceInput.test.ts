import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceInput } from '@/hooks/useVoiceInput'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  binaryType: 'arraybuffer' | 'blob' = 'blob'
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: unknown[] = []

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: unknown) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateTranscript(text: string, isFinal: boolean) {
    this.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'transcript', data: { is_final: isFinal, utterance: { text } } }),
    }))
  }
}

const mockAddModule = vi.fn().mockResolvedValue(undefined)
const mockResume = vi.fn().mockResolvedValue(undefined)
const mockClose = vi.fn().mockResolvedValue(undefined)
const mockCreateMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))

class MockAudioContext {
  audioWorklet = { addModule: mockAddModule }
  resume = mockResume
  close = mockClose
  createMediaStreamSource = mockCreateMediaStreamSource
}

class MockAudioWorkletNode {
  port = { onmessage: null as ((e: MessageEvent) => void) | null }
  connect = vi.fn()
  disconnect = vi.fn()
}

const mockGetUserMedia = vi.fn()
const mockTrackStop = vi.fn()

beforeEach(() => {
  MockWebSocket.instances = []
  mockAddModule.mockClear()
  mockResume.mockClear()
  mockClose.mockClear()
  mockCreateMediaStreamSource.mockClear()
  mockGetUserMedia.mockReset()
  mockTrackStop.mockClear()

  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('AudioContext', MockAudioContext)
  vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: mockGetUserMedia },
  })

  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: mockTrackStop }],
  })

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: 'wss://gladia.io/v2/live?token=t' }),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useVoiceInput', () => {
  it('transitions idle → connecting → recording on start()', async () => {
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))
    expect(result.current.state).toBe('idle')

    act(() => result.current.start())
    expect(result.current.state).toBe('connecting')

    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.state).toBe('recording'))
  })

  it('fires onDraft for partial transcripts and onConfirmed for finals', async () => {
    const onDraft = vi.fn()
    const onConfirmed = vi.fn()
    const { result } = renderHook(() => useVoiceInput({ onDraft, onConfirmed }))

    act(() => result.current.start())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => MockWebSocket.instances[0].simulateTranscript('hello', false))
    expect(onDraft).toHaveBeenCalledWith('hello')

    act(() => MockWebSocket.instances[0].simulateTranscript('hello world', true))
    expect(onConfirmed).toHaveBeenCalledWith('hello world ')
  })

  it('transitions to processing on stop(), back to idle on next is_final', async () => {
    vi.useFakeTimers()
    const onConfirmed = vi.fn()
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed }))

    act(() => result.current.start())
    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await vi.waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => result.current.stop())
    expect(result.current.state).toBe('processing')

    act(() => MockWebSocket.instances[0].simulateTranscript('done', true))
    expect(result.current.state).toBe('idle')
    expect(onConfirmed).toHaveBeenCalledWith('done ')
  })

  it('falls back to idle after 3s safety timeout if no final arrives', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))

    act(() => result.current.start())
    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await vi.waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => result.current.stop())
    expect(result.current.state).toBe('processing')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.state).toBe('idle')
  })

  it('sets permissionDenied error when getUserMedia rejects with NotAllowedError', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))

    act(() => result.current.start())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.error).toBe('voice.permissionDenied'))
    expect(result.current.state).toBe('idle')
  })

  it('sets unavailable error and stays idle when session fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))

    act(() => result.current.start())
    await waitFor(() => expect(result.current.error).toBe('voice.unavailable'))
    expect(result.current.state).toBe('idle')
  })

  it('reuses the open WS on a second start() (no new fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'wss://gladia.io/v2/live?token=t' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))
    act(() => result.current.start())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => result.current.stop())
    act(() => MockWebSocket.instances[0].simulateTranscript('one', true))
    await waitFor(() => expect(result.current.state).toBe('idle'))

    act(() => result.current.start())
    await waitFor(() => expect(result.current.state).toBe('recording'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('handles WS close during recording with connectionLost error', async () => {
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))
    act(() => result.current.start())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => MockWebSocket.instances[0].close())
    await waitFor(() => expect(result.current.error).toBe('voice.connectionLost'))
    expect(result.current.state).toBe('idle')
  })

  it('cleanup() sends stop_recording and closes WS', async () => {
    const { result } = renderHook(() => useVoiceInput({ onDraft: vi.fn(), onConfirmed: vi.fn() }))
    act(() => result.current.start())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    act(() => MockWebSocket.instances[0].simulateOpen())
    await waitFor(() => expect(result.current.state).toBe('recording'))

    act(() => result.current.cleanup())
    const ws = MockWebSocket.instances[0]
    expect(ws.sent).toContainEqual(JSON.stringify({ type: 'stop_recording' }))
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })
})
