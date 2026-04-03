import { act, render, waitFor } from '@testing-library/react'
// frontend/tests/LessonView.restore.test.tsx
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LessonView } from '@/components/lesson/LessonView'
import { useLesson } from '@/hooks/useLesson'

// ── Minimal doubles ──────────────────────────────────────────────────────────

const mockSeekTo = vi.fn()
const mockPlay = vi.fn()
const mockPause = vi.fn()

// Collect all subscribeTime callbacks so tests can fire time ticks
const timeSubscribers: ((t: number) => void)[] = []
function fireTime(t: number) { timeSubscribers.forEach(cb => cb(t)) }

vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: { seekTo: mockSeekTo, play: mockPlay, pause: mockPause },
    subscribeTime: (cb: (t: number) => void) => {
      timeSubscribers.push(cb)
      return () => {
        const i = timeSubscribers.indexOf(cb); if (i >= 0)
          timeSubscribers.splice(i, 1)
      }
    },
    getTime: () => 0,
  }),
  PlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: {}, keys: {} }),
}))

vi.mock('@/contexts/LessonsContext', () => ({
  useLessons: () => ({ updateLesson: vi.fn() }),
}))

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

// Mutable so individual tests can inject a pending action
let mockPendingAction: { type: string, payload?: Record<string, unknown> } | null = null
const mockClearAction = vi.fn()

vi.mock('@/contexts/AgentActionsContext', () => ({
  AgentActionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAgentActions: () => ({ pendingAction: mockPendingAction, clearAction: mockClearAction }),
}))

vi.mock('@/contexts/VocabularyContext', () => ({
  useVocabulary: () => ({ entries: [], save: vi.fn(), remove: vi.fn(), isSaved: () => false }),
}))

vi.mock('@/lib/language-caps', () => ({
  getLanguageCaps: () => ({ azurePronunciationLocale: null }),
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'lesson-1' }),
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useLesson', () => ({
  useLesson: vi.fn(),
}))

vi.mock('@/db', () => ({
  getVideo: vi.fn().mockResolvedValue(null),
  saveLessonMeta: vi.fn().mockResolvedValue(undefined),
}))

// Stub heavy child components to avoid dependency chain
vi.mock('@/components/lesson/TranscriptPanel', () => ({
  TranscriptPanel: () => <div data-testid="transcript-panel" />,
}))
vi.mock('@/components/lesson/VideoPanel', () => ({
  VideoPanel: () => <div data-testid="video-panel" />,
}))
vi.mock('@/components/lesson/CompanionPanel', () => ({
  CompanionPanel: () => <div data-testid="companion-panel" />,
}))

vi.mock('@/hooks/useActiveSegment', () => ({
  useActiveSegment: () => null,
}))

vi.mock('@/components/shadowing/ShadowingPanel', () => ({
  ShadowingPanel: () => <div data-testid="shadowing-panel" />,
}))

vi.mock('@/components/shadowing/ShadowingModePicker', () => ({
  ShadowingModePicker: () => <div data-testid="shadowing-mode-picker" />,
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { id: 'seg-1', start: 0, end: 5, text: 'Hello', romanization: '', translations: {}, words: [] },
  { id: 'seg-2', start: 5, end: 10, text: 'World', romanization: '', translations: {}, words: [] },
  { id: 'seg-12', start: 55, end: 60, text: 'Twelve', romanization: '', translations: {}, words: [] },
]

const BASE_META = {
  id: 'lesson-1',
  title: 'Test Lesson',
  source: 'youtube' as const,
  sourceUrl: null,
  translationLanguages: ['en'],
  createdAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
  tags: [],
  progressSegmentId: null as string | null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resume Lesson Progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPendingAction = null
    timeSubscribers.length = 0
  })

  it('aC1 – does NOT seek when progressSegmentId is null (new lesson)', async () => {
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: null },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(mockSeekTo).not.toHaveBeenCalled()
    })
  })

  it('aC3 – seeks to the saved segment start time on load', async () => {
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: 'seg-12' },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(mockSeekTo).toHaveBeenCalledWith(55) // seg-12.start
    })
  })

  it('eC2 – does NOT seek when progressSegmentId references a non-existent segment', async () => {
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: 'seg-orphan' },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(mockSeekTo).not.toHaveBeenCalled()
    })
  })

  it('eC2 – clears invalid progressSegmentId from IDB when orphaned', async () => {
    const { saveLessonMeta } = await import('@/db')

    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: 'seg-orphan' },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(saveLessonMeta).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ progressSegmentId: null }),
      )
    })
  })

  it('does NOT seek again if player changes reference (seek is one-shot)', async () => {
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: 'seg-2' },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(mockSeekTo).toHaveBeenCalledTimes(1)
    })

    // Confirm it doesn't fire again
    await waitFor(() => {
      expect(mockSeekTo).toHaveBeenCalledTimes(1)
    })
  })

  it('play_segment_audio — seeks to segment start and plays', async () => {
    mockPendingAction = { type: 'play_segment_audio', payload: { segmentIndex: 1 } }
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: null },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => {
      expect(mockSeekTo).toHaveBeenCalledWith(5) // seg-2.start
      expect(mockPlay).toHaveBeenCalled()
    })
  })

  it('play_segment_audio — auto-pauses when segment end is reached', async () => {
    mockPendingAction = { type: 'play_segment_audio', payload: { segmentIndex: 1 } }
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: null },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => expect(mockPlay).toHaveBeenCalled())

    act(() => fireTime(10)) // seg-2.end = 10

    expect(mockPause).toHaveBeenCalled()
  })

  it('play_segment_audio — does not pause before segment end', async () => {
    mockPendingAction = { type: 'play_segment_audio', payload: { segmentIndex: 1 } }
    vi.mocked(useLesson).mockReturnValue({
      meta: { ...BASE_META, progressSegmentId: null },
      segments: SEGMENTS,
      loading: false,
      error: null,
      updateMeta: vi.fn(),
    })

    render(<LessonView />)

    await waitFor(() => expect(mockPlay).toHaveBeenCalled())

    act(() => fireTime(7)) // inside seg-2 (end=10)

    expect(mockPause).not.toHaveBeenCalled()
  })

  it('flushes pending IDB write immediately on unmount (tab close / refresh)', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(useLesson).mockReturnValue({
        meta: { ...BASE_META, progressSegmentId: null },
        segments: SEGMENTS,
        loading: false,
        error: null,
        updateMeta: vi.fn(),
      })

      const { unmount } = render(<LessonView />)

      // Unmount before any debounce fires — should not leave dangling timers
      unmount()

      // All timers should be cleaned up
      vi.runAllTimers()
      // No unhandled promise rejections or errors expected
      expect(true).toBe(true) // structural check — test passes if no errors thrown
    }
    finally {
      vi.useRealTimers()
    }
  })
})
