import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShadowingPanel } from '@/components/shadowing/ShadowingPanel'
import type { Segment } from '@/types'

// ── Mock PlayerContext ─────────────────────────────────────────────────────

let endedCallbacks: Array<() => void> = []

const mockPlayer = {
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 60),
  setPlaybackRate: vi.fn(),
  setVolume: vi.fn(),
  onTimeUpdate: vi.fn(() => vi.fn()),
  onEnded: vi.fn((cb: () => void) => {
    endedCallbacks.push(cb)
    return () => { endedCallbacks = endedCallbacks.filter(c => c !== cb) }
  }),
  onPlay: vi.fn(() => vi.fn()),
  onPause: vi.fn(() => vi.fn()),
  destroy: vi.fn(),
}

vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: mockPlayer,
    subscribeTime: vi.fn(() => () => {}),
    getTime: vi.fn(() => 0),
    playbackRate: 1,
    volume: 1,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSegment(i: number, duration = 3): Segment {
  return {
    id: `seg-${i}`,
    start: i * 5,
    end: i * 5 + duration,
    chinese: `中文${i}`,
    pinyin: `zhongwen${i}`,
    translations: { en: `English ${i}` },
    words: [],
  }
}

const DEFAULT_PROPS = {
  segments: [makeSegment(0), makeSegment(1)],
  mode: 'dictation' as const,
  azureKey: '',
  azureRegion: '',
  onExit: vi.fn(),
}

function fireEnded() {
  endedCallbacks.forEach(cb => cb())
}

async function advanceThroughDictation(answer: string) {
  fireEnded()
  await waitFor(() => { expect(screen.getByRole('textbox')).toBeTruthy() })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: answer } })
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => { expect(screen.getByRole('button', { name: /next/i })).toBeTruthy() })
  fireEvent.click(screen.getByRole('button', { name: /next/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  endedCallbacks = []
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('shadowingPanel', () => {
  it('starts in Listen phase, seeks to segment 0, plays', () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    expect(screen.getByText(/listen/i)).toBeTruthy()
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0) // segment 0 start
    expect(mockPlayer.play).toHaveBeenCalled()
  })

  it('transitions to dictation attempt after ended event fires', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => {
      expect(screen.getByText(/type what you heard/i)).toBeTruthy()
    })
  })

  it('does not transition twice on double ended event', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    fireEnded()
    await waitFor(() => {
      expect(screen.getByText(/type what you heard/i)).toBeTruthy()
    })
    // Still in dictation, not skipped forward
    expect(screen.getByText(/1 \/ 2/)).toBeTruthy()
  })

  it('shows Reveal phase after dictation submit', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '中文0' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => {
      expect(screen.getByText('中文0')).toBeTruthy() // correct chinese shown
      expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    })
  })

  it('returns to Listen on Retry (same segment)', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => {
      expect(screen.getByText(/listen/i)).toBeTruthy()
      expect(screen.getByText(/1 \/ 2/)).toBeTruthy() // still segment 1
    })
  })

  it('advances to segment 2 after Next', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    await advanceThroughDictation('中文0')
    await waitFor(() => {
      expect(screen.getByText(/2 \/ 2/)).toBeTruthy()
    })
  })

  it('shows session summary after all segments completed', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={[makeSegment(0)]} />)
    await advanceThroughDictation('中文0')
    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeTruthy()
    })
  })

  it('exits silently when < 3 attempts', () => {
    const onExit = vi.fn()
    render(<ShadowingPanel {...DEFAULT_PROPS} onExit={onExit} />)
    fireEvent.click(screen.getByLabelText(/exit shadowing mode/i))
    expect(onExit).toHaveBeenCalledOnce()
    expect(screen.queryByText(/exit shadowing mode\?/i)).toBeNull()
  })

  it('shows confirmation dialog when >= 3 attempts', async () => {
    const segments = [0, 1, 2, 3].map(i => makeSegment(i))
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={segments} />)

    await advanceThroughDictation('中文0')
    await advanceThroughDictation('中文1')
    await advanceThroughDictation('中文2')

    fireEvent.click(screen.getByLabelText(/exit shadowing mode/i))
    await waitFor(() => {
      expect(screen.getByText(/exit shadowing mode\?/i)).toBeTruthy()
    })
  })

  it('auto-skips segments with duration < 0.5 s', async () => {
    const segments = [
      { ...makeSegment(0), start: 0, end: 0.3 }, // short
      makeSegment(1),
    ]
    render(<ShadowingPanel {...DEFAULT_PROPS} segments={segments} />)
    // Should auto-skip to segment 1 — seekTo called with segment 1's start
    await waitFor(() => {
      expect(mockPlayer.seekTo).toHaveBeenCalledWith(segments[1].start)
    })
  })

  it('does not submit empty dictation answer (shake only)', async () => {
    render(<ShadowingPanel {...DEFAULT_PROPS} />)
    fireEnded()
    await waitFor(() => screen.getByRole('textbox'))
    // Leave input empty, click Submit
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    // Should still be in dictation phase
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})
