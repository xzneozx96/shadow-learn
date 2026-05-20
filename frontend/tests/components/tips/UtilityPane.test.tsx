import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UtilityPane } from '../../../src/components/tips/UtilityPane'

// Stub useAuth so the chat hook can mount without an AuthProvider wrapper.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

// Stub I18nContext with real EN translations so assertions match user-facing text.
vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

// Stub @ai-sdk/react and ai so useTipChat doesn't try to make a real transport.
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({ messages: [], sendMessage: vi.fn(), status: 'ready' as const }),
}))
vi.mock('ai', () => ({
  DefaultChatTransport: class { constructor(_: unknown) {} },
}))

describe('utilityPane', () => {
  it('renders a tablist with three tabs (Summary/Chat/Studio)', () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByRole('tab', { name: /notes/i })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /studio/i })).toBeInTheDocument()
  })

  it('summary tab is selected by default', () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking Studio tab shows the tile grid (not the coming-soon placeholder)', async () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="x" transcriptStatus="ready" />)
    await userEvent.click(screen.getByRole('tab', { name: /studio/i }))
    expect(screen.getByRole('heading', { level: 3, name: /study guide/i })).toBeInTheDocument()
    expect(screen.queryByText(/coming in b2/i)).not.toBeInTheDocument()
  })

  it('studio tile grid includes a Flashcards tile (Cards merged from its own tab)', async () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="x" transcriptStatus="ready" />)
    await userEvent.click(screen.getByRole('tab', { name: /studio/i }))
    expect(screen.getByRole('heading', { level: 3, name: /flashcards/i })).toBeInTheDocument()
  })

  it('shows too-long takeover when transcriptStatus is too_long', () => {
    render(<UtilityPane courseId="c" videoId="v" lessonTitle="t" transcript="" transcriptStatus="too_long" />)
    expect(screen.getByText(/too long/i)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
