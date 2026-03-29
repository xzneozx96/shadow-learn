import type { Segment } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '@/components/lesson/TranscriptPanel'

// Stub heavy dependencies not relevant to this test
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

const mockPlayTTS = vi.fn()
vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: mockPlayTTS, loadingText: null }),
}))

vi.mock('@/contexts/VocabularyContext', () => ({
  useVocabulary: () => ({ entries: [], save: vi.fn(), remove: vi.fn(), isSaved: () => false }),
}))
vi.mock('@/components/lesson/SegmentText', () => ({
  SegmentText: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

function makeSegment(id: string, text: string): Segment {
  return {
    id,
    start: 0,
    end: 5,
    text,
    romanization: '',
    translations: { en: 'test' },
    words: [],
  }
}

const lesson = {
  id: 'l1',
  title: 'Test',
  source: 'upload' as const,
  sourceUrl: null,
  translationLanguages: ['en'],
  createdAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
  progressSegmentId: null,
  tags: [],
  status: 'complete' as const,
}

describe('transcriptPanel segment row — not clickable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not call onSegmentClick when the segment row is clicked', () => {
    const segment = makeSegment('s1', '你好')
    const onSegmentClick = vi.fn()
    render(
      <TranscriptPanel
        segments={[segment]}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={onSegmentClick}
        onProgressUpdate={vi.fn()}
      />,
    )
    // Click the segment text, not the speaker button
    fireEvent.click(screen.getByText('你好'))
    expect(onSegmentClick).not.toHaveBeenCalled()
  })
})

describe('transcriptPanel speaker button', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls onSegmentClick with the segment when speaker button is clicked', () => {
    const segment = makeSegment('s1', '你好')
    const onSegmentClick = vi.fn()
    render(
      <TranscriptPanel
        segments={[segment]}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={onSegmentClick}
        onProgressUpdate={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play from here' }))
    expect(onSegmentClick).toHaveBeenCalledOnce()
    expect(onSegmentClick).toHaveBeenCalledWith(segment)
  })

  it('does not bubble to trigger onSegmentClick a second time from the row', () => {
    const segment = makeSegment('s1', '你好')
    const onSegmentClick = vi.fn()
    render(
      <TranscriptPanel
        segments={[segment]}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={onSegmentClick}
        onProgressUpdate={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play from here' }))
    // stopPropagation on the button prevents the row's onClick from also firing
    expect(onSegmentClick).toHaveBeenCalledOnce()
  })

  it('does not call playTTS when speaker button is clicked', () => {
    const segment = makeSegment('s1', '你好')
    render(
      <TranscriptPanel
        segments={[segment]}
        activeSegment={null}
        lesson={lesson}
        onSegmentClick={vi.fn()}
        onProgressUpdate={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play from here' }))
    expect(mockPlayTTS).not.toHaveBeenCalled()
  })
})
