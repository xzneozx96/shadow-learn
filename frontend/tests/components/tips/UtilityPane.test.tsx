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
  it('renders a tablist with five tabs', () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
  })

  it('chat tab is selected by default in B1', () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    expect(screen.getByRole('tab', { name: /chat/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('b2/B3 placeholder tabs are clickable and reveal coming-soon copy', async () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    await userEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByRole('tab', { name: /notes/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/notes coming in b2/i)).toBeInTheDocument()
  })

  it('user can navigate back to Chat from a placeholder tab', async () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    await userEvent.click(screen.getByRole('tab', { name: /studio/i }))
    expect(screen.getByRole('tab', { name: /studio/i })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /chat/i }))
    expect(screen.getByRole('tab', { name: /chat/i })).toHaveAttribute('aria-selected', 'true')
  })
})
