import type { Segment } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '@/components/lesson/TranscriptPanel'

// Stub heavy dependencies not relevant to this test
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))
vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))
vi.mock('@/hooks/useVocabulary', () => ({
  useVocabulary: () => ({ save: vi.fn(), isSaved: () => false }),
}))
vi.mock('@/components/lesson/SegmentText', () => ({
  SegmentText: ({ text }: { text: string }) => <span>{text}</span>,
}))

function makeSegment(id: string, chinese: string): Segment {
  return {
    id,
    start: 0,
    end: 5,
    chinese,
    pinyin: '',
    translations: { en: 'test' },
    words: [],
  }
}

const lesson = {
  id: 'l1',
  title: 'Test',
  translationLanguages: ['en'],
  createdAt: 0,
  status: 'ready' as const,
}

describe('TranscriptPanel shadow icon', () => {
  it('renders a shadow icon button for each segment', () => {
    const segments = [makeSegment('s1', '你好'), makeSegment('s2', '再见')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: 'Shadow from this segment' })
    expect(buttons).toHaveLength(2)
  })

  it('calls onShadowClick with the correct segment reference', () => {
    const segments = [makeSegment('s1', '你好'), makeSegment('s2', '再见')]
    const onShadowClick = vi.fn()
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={onShadowClick}
      />,
    )
    const [btn1] = screen.getAllByRole('button', { name: 'Shadow from this segment' })
    fireEvent.click(btn1)
    expect(onShadowClick).toHaveBeenCalledWith(segments[0])
  })

  it('does not call onSegmentClick when shadow icon is clicked', () => {
    const segments = [makeSegment('s1', '你好')]
    const onSegmentClick = vi.fn()
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={onSegmentClick}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Shadow from this segment' }))
    expect(onSegmentClick).not.toHaveBeenCalled()
  })

  it('does not render shadow buttons when onShadowClick is not provided', () => {
    const segments = [makeSegment('s1', '你好')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Shadow from this segment' })).not.toBeInTheDocument()
  })

  it('does not render the top-level Shadow button', () => {
    const segments = [makeSegment('s1', '你好')]
    render(
      <TranscriptPanel
        segments={segments}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
        onShadowClick={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Shadow$/i })).not.toBeInTheDocument()
  })
})
