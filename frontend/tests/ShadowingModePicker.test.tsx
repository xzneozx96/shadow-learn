import type { Segment } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/ui/dialog'
import { ShadowingModePicker } from '@/components/shadowing/ShadowingModePicker'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <Dialog open>{children}</Dialog>
}

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    start: 3660, // 01:01:00
    end: 3665,
    chinese: '你好吗',
    pinyin: 'nǐ hǎo ma',
    translations: { en: 'How are you?' },
    words: [],
    ...overrides,
  }
}

const baseProps = {
  startSegment: makeSegment(),
  startSegmentNumber: 12,
  totalRemaining: 88,
  speakingAvailable: true,
  onStart: vi.fn(),
  onClose: vi.fn(),
}

describe('ShadowingModePicker', () => {
  it('shows start segment info in description', () => {
    render(<ShadowingModePicker {...baseProps} />, { wrapper: Wrapper })
    expect(screen.getByText(/segment 12/)).toBeInTheDocument()
    expect(screen.getByText(/你好吗/)).toBeInTheDocument()
    expect(screen.getByText(/01:01:00/)).toBeInTheDocument()
  })

  it('defaults count to 10 when totalRemaining > 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={88} />, { wrapper: Wrapper })
    // The "10" chip should appear selected (aria-pressed or data-selected)
    const chip10 = screen.getByRole('button', { name: '10' })
    expect(chip10).toHaveAttribute('data-selected', 'true')
  })

  it('defaults count to all when totalRemaining <= 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={8} />, { wrapper: Wrapper })
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).toHaveAttribute('data-selected', 'true')
  })

  it('defaults count to all when totalRemaining is exactly 10', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={10} />, { wrapper: Wrapper })
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).toHaveAttribute('data-selected', 'true')
    // The 10-chip is enabled but not selected
    expect(screen.getByRole('button', { name: '10' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('data-selected', 'false')
  })

  it('disables 5/10/20 chips when totalRemaining < chip value', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={4} />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '20' })).toBeDisabled()
  })

  it('never disables the All chip', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={1} />, { wrapper: Wrapper })
    const chipAll = screen.getByRole('button', { name: /All/ })
    expect(chipAll).not.toBeDisabled()
  })

  it('shows totalRemaining in the All chip label', () => {
    render(<ShadowingModePicker {...baseProps} totalRemaining={42} />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /All \(42\)/ })).toBeInTheDocument()
  })

  it('calls onStart with selected mode and count on Start', () => {
    const onStart = vi.fn()
    render(<ShadowingModePicker {...baseProps} onStart={onStart} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).toHaveBeenCalledWith('dictation', 20)
  })

  it('calls onStart with "all" when All chip selected', () => {
    const onStart = vi.fn()
    render(<ShadowingModePicker {...baseProps} totalRemaining={5} onStart={onStart} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).toHaveBeenCalledWith('dictation', 'all')
  })

  it('calls onClose on Cancel', () => {
    const onClose = vi.fn()
    render(<ShadowingModePicker {...baseProps} onClose={onClose} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('formatTimestamp (via picker description)', () => {
  it('formats 0 seconds as 00:00:00', () => {
    render(<ShadowingModePicker {...baseProps} startSegment={makeSegment({ start: 0 })} />, { wrapper: Wrapper })
    expect(screen.getByText(/00:00:00/)).toBeInTheDocument()
  })

  it('formats 3723 seconds as 01:02:03', () => {
    render(<ShadowingModePicker {...baseProps} startSegment={makeSegment({ start: 3723 })} />, { wrapper: Wrapper })
    expect(screen.getByText(/01:02:03/)).toBeInTheDocument()
  })
})
