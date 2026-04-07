import { act, renderHook } from '@testing-library/react'
import {
  getLastSeenId,
  hasUnseenAnnouncement,
  markAnnouncementSeen,
  useHasUnseenAnnouncement,
} from '@/lib/whats-new'

vi.mock('@/lib/changelog', () => ({
  getLatestAnnouncementId: vi.fn().mockReturnValue('2026-04-workbook-srs'),
}))

describe('getLastSeenId', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns null when nothing is stored', () => {
    expect(getLastSeenId()).toBeNull()
  })

  it('returns the stored id', () => {
    localStorage.setItem('shadowlearn:whats-new:last-seen', 'some-id')
    expect(getLastSeenId()).toBe('some-id')
  })
})

describe('markAnnouncementSeen', () => {
  beforeEach(() => { localStorage.clear() })

  it('writes the id to localStorage', () => {
    markAnnouncementSeen('2026-04-workbook-srs')
    expect(localStorage.getItem('shadowlearn:whats-new:last-seen')).toBe('2026-04-workbook-srs')
  })

  it('dispatches whats-new-seen event', () => {
    const handler = vi.fn()
    window.addEventListener('whats-new-seen', handler)
    markAnnouncementSeen('2026-04-workbook-srs')
    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('whats-new-seen', handler)
  })
})

describe('hasUnseenAnnouncement', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when localStorage is empty', () => {
    expect(hasUnseenAnnouncement('2026-04-workbook-srs')).toBe(true)
  })

  it('returns false when stored id matches latestId', () => {
    localStorage.setItem('shadowlearn:whats-new:last-seen', '2026-04-workbook-srs')
    expect(hasUnseenAnnouncement('2026-04-workbook-srs')).toBe(false)
  })

  it('returns true when stored id differs from latestId', () => {
    localStorage.setItem('shadowlearn:whats-new:last-seen', 'old-id')
    expect(hasUnseenAnnouncement('2026-04-workbook-srs')).toBe(true)
  })

  it('returns false when latestId is undefined', () => {
    expect(hasUnseenAnnouncement(undefined)).toBe(false)
  })
})

describe('useHasUnseenAnnouncement', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when announcement is unseen', () => {
    const { result } = renderHook(() => useHasUnseenAnnouncement())
    expect(result.current).toBe(true)
  })

  it('returns false after markAnnouncementSeen is called', () => {
    const { result } = renderHook(() => useHasUnseenAnnouncement())
    expect(result.current).toBe(true)

    act(() => {
      markAnnouncementSeen('2026-04-workbook-srs')
    })

    expect(result.current).toBe(false)
  })

  it('returns false when already seen before hook mounts', () => {
    localStorage.setItem('shadowlearn:whats-new:last-seen', '2026-04-workbook-srs')
    const { result } = renderHook(() => useHasUnseenAnnouncement())
    expect(result.current).toBe(false)
  })
})
