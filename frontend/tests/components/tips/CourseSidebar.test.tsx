import type { TipLesson } from '../../../src/types/tips'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CourseSidebar } from '../../../src/components/tips/CourseSidebar'

function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
}

const lessons: TipLesson[] = [
  { videoId: 'v1', title: 'Welcome', duration: '3:42', thumbnailUrl: null, durationSec: 222 },
  { videoId: 'v2', title: 'Four Tones', duration: '8:15', thumbnailUrl: null, durationSec: 495 },
  { videoId: 'v3', title: 'zh / ch / sh', duration: '11:28', thumbnailUrl: null, durationSec: 688 },
]

describe('courseSidebar', () => {
  it('renders course title and progress count/percentage', () => {
    render(<CourseSidebar courseName="Pronunciation" topic="Pronunciation" lessons={lessons} activeVideoId="v1" completedVideoIds={new Set(['v1'])} onSelect={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: /pronunciation/i })).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
    expect(screen.getByText(/33%/)).toBeInTheDocument()
  })

  it('marks the active lesson with aria-current=true', () => {
    render(<CourseSidebar courseName="P" topic={null} lessons={lessons} activeVideoId="v2" completedVideoIds={new Set()} onSelect={() => {}} />)
    const active = screen.getByText('Four Tones').closest('[role="listitem"]')
    expect(active).toHaveAttribute('aria-current', 'true')
  })

  it('calls onSelect with the videoId on click', async () => {
    const onSelect = vi.fn()
    render(<CourseSidebar courseName="P" topic={null} lessons={lessons} activeVideoId="v1" completedVideoIds={new Set()} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('zh / ch / sh'))
    expect(onSelect).toHaveBeenCalledWith('v3')
  })

  it('renders a completion checkmark for completed lessons', () => {
    render(<CourseSidebar courseName="P" topic={null} lessons={lessons} activeVideoId="v3" completedVideoIds={new Set(['v1', 'v2'])} onSelect={() => {}} />)
    const v1Row = screen.getByText('Welcome').closest('[role="listitem"]')!
    expect(within(v1Row as HTMLElement).getByLabelText(/completed/i)).toBeInTheDocument()
  })
})
