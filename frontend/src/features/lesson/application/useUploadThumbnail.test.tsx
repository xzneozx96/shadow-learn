import type { LessonMedia } from '@/shared/types'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadThumbnail } from '@/features/lesson/application/useUploadThumbnail'

const refreshMediaTicket = vi.fn(async () => 'http://api.test/api/media/m1?token=fresh')
const api = { get: vi.fn(), list: vi.fn(), put: vi.fn(), del: vi.fn(), bulk: vi.fn(), fetch: vi.fn() }

vi.mock('@/db', () => ({
  refreshMediaTicket: (...args: unknown[]) => refreshMediaTicket(...(args as [])),
}))

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: { api, legacy: {} } }),
}))

let observed: { callback: IntersectionObserverCallback, element: Element }[] = []
let videos: HTMLVideoElement[] = []

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  observe(element: Element) {
    observed.push({ callback: this.callback, element })
  }

  disconnect() {}
}

function scrollIntoView() {
  act(() => {
    for (const { callback, element } of observed)
      callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], {} as IntersectionObserver)
  })
}

function Card({ lessonId, media }: { lessonId: string, media?: LessonMedia }) {
  const { ref, dataUrl } = useUploadThumbnail(lessonId, media, true)
  return <div ref={ref}>{dataUrl}</div>
}

const media = (id: string): LessonMedia => ({ id, kind: 'video', url: `http://api.test/api/media/${id}?token=stale` })

beforeEach(() => {
  observed = []
  videos = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const element = create(tag, options)
    if (tag === 'video')
      videos.push(element as HTMLVideoElement)
    return element
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  refreshMediaTicket.mockClear()
})

describe('useUploadThumbnail', () => {
  it('loads the summary media only once the card is in view, with no lesson request', () => {
    render(<Card lessonId="l-view" media={media('m-view')} />)
    expect(videos).toHaveLength(0)

    scrollIntoView()

    expect(videos.map(v => v.src)).toEqual(['http://api.test/api/media/m-view?token=stale'])
    expect(Object.values(api).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })

  it('mints one fresh ticket when the stale ticket fails', async () => {
    render(<Card lessonId="l-expired" media={media('m1')} />)
    scrollIntoView()

    fireEvent.error(videos[0])
    fireEvent.error(videos[0])

    await waitFor(() => expect(videos[0].src).toBe('http://api.test/api/media/m1?token=fresh'))
    expect(refreshMediaTicket).toHaveBeenCalledTimes(1)
    expect(refreshMediaTicket).toHaveBeenCalledWith(expect.anything(), 'm1')
  })

  it('does not load a lesson without video media', () => {
    render(<Card lessonId="l-audio" media={{ id: 'a1', kind: 'audio', url: 'http://api.test/api/media/a1' }} />)
    scrollIntoView()

    expect(videos).toHaveLength(0)
  })
})
