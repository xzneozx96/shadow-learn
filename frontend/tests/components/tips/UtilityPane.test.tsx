import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UtilityPane } from '../../../src/components/tips/UtilityPane'

// Stub useAuth so the chat hook can mount without an AuthProvider wrapper.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: null, keys: null }),
}))

// Stub I18nContext for locale.
vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: (k: string) => k }),
}))

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

  it('notes/Cards/Script/Studio tabs are disabled in B1', () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    // base-ui disabled tab carries aria-disabled='true' or the DOM `disabled` attribute.
    // Accept either:
    function isDisabled(el: HTMLElement): boolean {
      return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
    }
    expect(isDisabled(screen.getByRole('tab', { name: /notes/i }))).toBe(true)
    expect(isDisabled(screen.getByRole('tab', { name: /cards/i }))).toBe(true)
    expect(isDisabled(screen.getByRole('tab', { name: /script/i }))).toBe(true)
    expect(isDisabled(screen.getByRole('tab', { name: /studio/i }))).toBe(true)
  })

  it('clicking a disabled tab does not switch selection', async () => {
    render(<UtilityPane courseId="PL1" videoId="v1" lessonTitle="t" transcript="" transcriptStatus="ready" />)
    await userEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByRole('tab', { name: /chat/i })).toHaveAttribute('aria-selected', 'true')
  })
})
