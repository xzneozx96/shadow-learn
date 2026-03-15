import type { LessonMeta } from '../src/types'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoPanel } from '../src/components/lesson/VideoPanel'

// Mock PlayerContext so we control volume/setVolume
const mockSetVolume = vi.fn()
vi.mock('../src/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: null,
    currentTime: 0,
    playbackRate: 1,
    volume: 0.8,
    setPlayer: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: mockSetVolume,
  }),
}))

// Mock react-router-dom Link (VideoPanel uses it for the Home button)
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

// Find the volume slider by its unique combination of max="1" and step="0.05".
// The scrubber has max equal to the video duration (0 when no player), making it distinct.
function getVolumeSlider(): HTMLInputElement {
  const sliders = [...document.querySelectorAll('input[type="range"]')]
  const el = sliders.find(
    s => s.getAttribute('max') === '1' && s.getAttribute('step') === '0.05',
  )
  if (!el)
    throw new Error('Volume slider not found')
  return el as HTMLInputElement
}

describe('videoPanel volume slider', () => {
  it('renders with the current volume value from context', () => {
    render(<VideoPanel lesson={lesson} segments={[]} activeSegment={null} />)
    const slider = getVolumeSlider()
    expect(slider.value).toBe('0.8')
  })

  it('calls setVolume with a rounded value on pointer release', () => {
    render(<VideoPanel lesson={lesson} segments={[]} activeSegment={null} />)
    const slider = getVolumeSlider()
    fireEvent.pointerUp(slider, { target: { value: '0.6' } })
    expect(mockSetVolume).toHaveBeenCalledWith(0.6)
  })
})
