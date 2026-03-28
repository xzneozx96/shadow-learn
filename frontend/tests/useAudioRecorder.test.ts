import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

// Minimal MediaRecorder mock
function makeRecorderMock() {
  let onstop: (() => void) | null = null
  let ondataavailable: ((e: { data: Blob }) => void) | null = null
  const recorder = {
    start: vi.fn(),
    stop: vi.fn().mockImplementation(() => { onstop?.() }),
    ondataavailable: null as any,
    onstop: null as any,
    get _onstop() { return onstop },
    set _onstop(fn) { onstop = fn },
    get _ondataavailable() { return ondataavailable },
    set _ondataavailable(fn) { ondataavailable = fn },
  }
  // Proxy so setting recorder.onstop updates our internal ref
  return new Proxy(recorder, {
    set(target: any, key, value) {
      if (key === 'onstop') {
        onstop = value
        return true
      }
      if (key === 'ondataavailable') {
        ondataavailable = value
        return true
      }
      target[key] = value
      return true
    },
  })
}

function makeStreamMock() {
  const track = { stop: vi.fn() }
  return { getTracks: vi.fn(() => [track]), _track: track }
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAudioRecorder', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.current.recordingState).toBe('idle')
    expect(result.current.blob).toBeNull()
    expect(result.current.attempt).toBe(0)
  })

  it('transitions idle → recording on startRecording', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => { return recorder }))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.recordingState).toBe('recording')
    expect(result.current.attempt).toBe(1)
    expect(recorder.start).toHaveBeenCalledOnce()
  })

  it('transitions recording → processing → stopped on stopRecording', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => { return recorder }))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => {
      await result.current.startRecording()
    })

    // Simulate a data chunk arriving
    act(() => {
      (recorder as any).ondataavailable?.({ data: new Blob(['audio']) })
    })

    // stopRecording triggers recorder.stop() which synchronously calls onstop in our mock
    act(() => {
      result.current.stopRecording()
    })

    expect(result.current.recordingState).toBe('stopped')
    expect(result.current.blob).not.toBeNull()
  })

  it('discards blob and resets to idle when recording is shorter than minDurationMs', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => { return recorder }))

    // Use real Date.now but control timing by patching it
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const { result } = renderHook(() => useAudioRecorder({ minDurationMs: 500 }))
    await act(async () => {
      now = 1000
      await result.current.startRecording()
    })

    act(() => {
      (recorder as any).ondataavailable?.({ data: new Blob(['audio']) })
    })

    // Stop immediately — duration = 0ms < 500ms
    act(() => {
      result.current.stopRecording()
    })

    expect(result.current.recordingState).toBe('idle')
    expect(result.current.blob).toBeNull()
  })

  it('cancel() resets to idle and prevents onstop from setting blob', async () => {
    const stream = makeStreamMock()
    // Use a recorder whose stop() does NOT immediately call onstop (async)
    let capturedOnstop: (() => void) | null = null
    const recorder = {
      start: vi.fn(),
      stop: vi.fn(),
      get onstop() {
        return capturedOnstop
      },
      set onstop(fn: any) {
        capturedOnstop = fn
      },
      get ondataavailable() {
        return undefined
      },
      set ondataavailable(_fn: any) {},
    }
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn(() => recorder))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => {
      await result.current.startRecording()
    })

    act(() => {
      result.current.cancel()
    })
    expect(result.current.recordingState).toBe('idle')

    // Now fire onstop — should be ignored
    act(() => {
      capturedOnstop?.()
    })
    expect(result.current.blob).toBeNull()
    expect(result.current.recordingState).toBe('idle')
  })

  it('reset() clears blob and revokes object URL', async () => {
    const stream = makeStreamMock()
    const recorder = makeRecorderMock()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => { return recorder }))

    const { result } = renderHook(() => useAudioRecorder())
    await act(async () => {
      await result.current.startRecording()
    })
    act(() => {
      (recorder as any).ondataavailable?.({ data: new Blob(['audio']) })
    })
    act(() => {
      result.current.stopRecording()
    })
    expect(result.current.blob).not.toBeNull()

    act(() => {
      result.current.reset()
    })
    expect(result.current.blob).toBeNull()
    expect(result.current.recordingState).toBe('idle')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
