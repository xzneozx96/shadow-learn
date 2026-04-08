import type { LessonMeta } from '../src/types'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoPanel } from '../src/components/lesson/VideoPanel'

const mockPlay = vi.fn()
const mockPause = vi.fn()

const mockPlayer = {
  play: mockPlay,
  pause: mockPause,
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  getDuration: vi.fn(() => 0),
  getTime: vi.fn(() => 0),
  onEnded: vi.fn(() => () => {}),
  onPlay: vi.fn((cb) => { cb(); return () => {} }),
  onPause: vi.fn(() => () => {}),
}

vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: mockPlayer,
    subscribeTime: vi.fn(() => () => {}),
    getTime: vi.fn(() => 0),
    playbackRate: 1,
    volume: 0.8,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
  }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

const lesson: LessonMeta = {
  id: '1',
  title: 'Test Lesson',
  source: 'upload',
  sourceUrl: null,
  duration: 120,
  segmentCount: 3,
  translationLanguages: ['en'],
  createdAt: '2026-01-01',
  lastOpenedAt: '2026-01-01',
  progressSegmentId: null,
  tags: [],
}

const videoBlob = new Blob([''], { type: 'video/mp4' })

describe('videoPanel click-to-play', () => {
  it('pauses when clicking the video while playing', () => {
    const { container } = render(
      <VideoPanel lesson={lesson} segments={[]} activeSegment={null} videoBlob={videoBlob} />,
    )
    const video = container.querySelector('video')!
    expect(video).not.toBeNull()
    fireEvent.click(video)
    expect(mockPause).toHaveBeenCalledTimes(1)
  })

  it('plays when clicking the video while paused', () => {
    // Override onPlay to NOT immediately fire (so isPlaying stays false)
    mockPlayer.onPlay.mockImplementation(() => () => {})
    mockPlay.mockClear()

    const { container } = render(
      <VideoPanel lesson={lesson} segments={[]} activeSegment={null} videoBlob={videoBlob} />,
    )
    const video = container.querySelector('video')!
    fireEvent.click(video)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })
})
