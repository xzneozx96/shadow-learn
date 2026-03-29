import type { Word } from '@/types'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SegmentText } from '@/components/lesson/SegmentText'

// ── Player mock ──────────────────────────────────────────────────────────────
// Capture onPlay/onPause callbacks so tests can control isPlayingRef
let playCallback: (() => void) | undefined

const mockPlayer = {
  play: vi.fn(),
  pause: vi.fn(),
  onPlay: vi.fn((cb: () => void) => { playCallback = cb; return () => {} }),
  onPause: vi.fn((_cb: () => void) => () => {}),
  onTimeUpdate: vi.fn(() => () => {}),
}

vi.mock('@/contexts/PlayerContext', () => ({
  usePlayer: () => ({
    player: mockPlayer,
    subscribeTime: () => () => {},
    getTime: () => 0,
  }),
}))

// ── Popover mock ─────────────────────────────────────────────────────────────
// Render content inline (no portal) and capture onOpenChange so tests can
// simulate both opening (via trigger click) and closing (via direct call).
let popoverOnOpenChange: ((open: boolean) => void) | undefined

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, onOpenChange }: any) => {
    popoverOnOpenChange = onOpenChange
    return <>{children}</>
  },
  PopoverTrigger: ({ children, onClick, ...props }: any) => (
    <span
      data-testid="vocab-trigger"
      onClick={(e: React.MouseEvent) => { onClick?.(e); popoverOnOpenChange?.(true) }}
      {...props}
    >
      {children}
    </span>
  ),
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}))

// ── Other required mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// ── Test data ────────────────────────────────────────────────────────────────
const word: Word = {
  word: '今天',
  romanization: 'jīntiān',
  meaning: 'today',
  usage: '今天很好。',
}

function renderSegmentText() {
  render(
    <SegmentText
      text="今天"
      words={[word]}
      playTTS={vi.fn()}
      loadingText={null}
    />,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('segmentText vocab popup — play/pause', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playCallback = undefined
    popoverOnOpenChange = undefined
  })

  it('pauses player when a vocab word is clicked while playing', () => {
    renderSegmentText()
    act(() => { playCallback?.() }) // simulate player playing
    fireEvent.click(screen.getByTestId('vocab-trigger'))
    expect(mockPlayer.pause).toHaveBeenCalledOnce()
  })

  it('resumes player when popup closes after we paused it', () => {
    renderSegmentText()
    act(() => { playCallback?.() }) // simulate player playing
    fireEvent.click(screen.getByTestId('vocab-trigger'))
    act(() => { popoverOnOpenChange?.(false) }) // close popup
    expect(mockPlayer.play).toHaveBeenCalledOnce()
  })

  it('does not pause player when vocab word clicked while player is paused', () => {
    renderSegmentText()
    // player is paused — do NOT fire playCallback
    fireEvent.click(screen.getByTestId('vocab-trigger'))
    expect(mockPlayer.pause).not.toHaveBeenCalled()
  })

  it('does not resume player when popup closes if player was already paused when opened', () => {
    renderSegmentText()
    // player is paused — do NOT fire playCallback
    fireEvent.click(screen.getByTestId('vocab-trigger'))
    act(() => { popoverOnOpenChange?.(false) })
    expect(mockPlayer.play).not.toHaveBeenCalled()
  })
})
