import type { LessonMeta } from '@/shared/types'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoPanel } from '@/features/lesson/ui/VideoPanel'

const refreshMediaTicket = vi.fn(async () => 'http://api.test/api/media/m1?token=fresh')

vi.mock('@/db', () => ({
  refreshMediaTicket: (...args: unknown[]) => refreshMediaTicket(...(args as [])),
}))

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: { api: {}, legacy: {} } }),
}))

vi.mock('@/app/providers/PlayerContext', () => ({
  usePlayer: () => ({
    player: null,
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
  id: 'l1',
  title: 'Ticket Lesson',
  source: 'upload',
  sourceUrl: null,
  translationLanguages: ['en'],
  createdAt: '2026-01-01',
  lastOpenedAt: '2026-01-01',
  progressSegmentId: null,
  tags: [],
}

const media = { id: 'm1', kind: 'video' as const, url: 'http://api.test/api/media/m1?token=stale' }

describe('videoPanel media ticket', () => {
  it('mints one fresh ticket when the stale one fails, and not again until the media loads', async () => {
    const { container } = render(
      <VideoPanel lesson={lesson} segments={[]} activeSegment={null} media={media} />,
    )
    const video = container.querySelector('video')!
    expect(video.src).toBe(media.url)

    fireEvent.error(video)
    await waitFor(() => expect(video.src).toBe('http://api.test/api/media/m1?token=fresh'))
    expect(refreshMediaTicket).toHaveBeenCalledTimes(1)
    expect(refreshMediaTicket).toHaveBeenCalledWith(expect.anything(), 'm1')

    fireEvent.error(video)
    expect(refreshMediaTicket).toHaveBeenCalledTimes(1)

    fireEvent.canPlay(video)
    fireEvent.error(video)
    await waitFor(() => expect(refreshMediaTicket).toHaveBeenCalledTimes(2))
  })
})
