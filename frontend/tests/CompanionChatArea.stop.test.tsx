import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CompanionChatArea } from '@/components/chat/CompanionChatArea'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

beforeAll(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as any
})

describe('companionChatArea — streaming stop', () => {
  it('calls onStop instead of onSend when stop is clicked during streaming', async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()

    render(
      <CompanionChatArea
        messages={[]}
        isLoading
        hasMore={false}
        onLoadMore={vi.fn()}
        chips={[]}
        onRemoveChip={vi.fn()}
        onSend={onSend}
        onStop={onStop}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop/i }))

    expect(onStop).toHaveBeenCalledOnce()
    expect(onSend).not.toHaveBeenCalled()
  })
})
