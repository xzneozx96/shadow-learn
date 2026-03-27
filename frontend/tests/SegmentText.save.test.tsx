import type { Segment, Word } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Import after mocks are hoisted
import { SegmentText } from '@/components/lesson/SegmentText'

// Mock the tooltip components so TooltipContent renders inline (no hover/portal required).
// This lets us assert on the bookmark button without fighting with jsdom hover mechanics.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock Popover so PopoverContent always renders inline (not in a portal that requires open state).
// The save button lives inside PopoverContent, so this lets us assert on it directly.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, ...props }: { children: React.ReactNode, [key: string]: any }) => <span {...props}>{children}</span>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock I18nContext so SegmentText can be rendered without an I18nProvider in tests.
vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// Mock PlayerContext so SegmentText can be rendered without a PlayerProvider in tests.
vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    subscribeTime: () => () => {},
    getTime: () => 0,
  }),
}))

const word: Word = {
  word: '今天',
  romanization: 'jīntiān',
  meaning: 'today',
  usage: '今天很好。',
}

const segment: Segment = {
  id: 'seg_1',
  start: 0,
  end: 5,
  text: '今天好',
  romanization: 'jīntiān hǎo',
  translations: { en: 'Good today' },
  words: [word],
}

describe('segmentText save button', () => {
  it('renders bookmark button when onSaveWord and segment are provided', () => {
    const onSave = vi.fn()
    render(
      <SegmentText
        text="今天"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        onSaveWord={onSave}
        isSaved={() => false}
        segment={segment}
      />,
    )
    const btn = screen.getByTitle('Save to Workbook')
    expect(btn).toBeTruthy()
  })

  it('calls onSaveWord with the word and segment when bookmark button is clicked', () => {
    const onSave = vi.fn()
    render(
      <SegmentText
        text="今天"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        onSaveWord={onSave}
        isSaved={() => false}
        segment={segment}
      />,
    )
    const btn = screen.getByTitle('Save to Workbook')
    fireEvent.click(btn)
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith(word, segment)
  })

  it('shows "Already in Workbook" title and disables button when word is saved', () => {
    render(
      <SegmentText
        text="今天"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        onSaveWord={vi.fn()}
        isSaved={() => true}
        segment={segment}
      />,
    )
    const btn = screen.getByTitle('Already in Workbook')
    expect(btn).toBeDisabled()
  })

  it('does not render bookmark button when onSaveWord is not provided', () => {
    render(
      <SegmentText
        text="今天"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        segment={segment}
      />,
    )
    expect(screen.queryByTitle('Save to Workbook')).toBeNull()
    expect(screen.queryByTitle('Already in Workbook')).toBeNull()
  })

  it('does not render bookmark button when segment is not provided', () => {
    render(
      <SegmentText
        text="今天"
        words={[word]}
        playTTS={vi.fn()}
        loadingText={null}
        onSaveWord={vi.fn()}
        isSaved={() => false}
      />,
    )
    expect(screen.queryByTitle('Save to Workbook')).toBeNull()
  })
})
