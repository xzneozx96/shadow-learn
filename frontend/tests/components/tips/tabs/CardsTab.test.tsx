import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardsTab } from '../../../../src/components/tips/tabs/CardsTab'
import { cardsKey } from '../../../../src/db'
import 'fake-indexeddb/auto'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

// Use real DB so we can verify persistence
const mockDb = { value: null as any }
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: mockDb.value, keys: null }),
}))

beforeEach(async () => {
  const { deleteDB } = await import('idb')
  mockDb.value?.close?.()
  mockDb.value = null
  await deleteDB('shadowlearn')
  const { initDB, putTipCards } = await import('../../../../src/db')
  mockDb.value = await initDB()
  await putTipCards(mockDb.value, {
    key: cardsKey('v1', 'en'),
    videoId: 'v1',
    locale: 'en',
    cards: [
      { id: 'a', front: 'Q1', rule: 'R1', example: 'E1', trap: null, state: 'new', updatedAt: '' },
      { id: 'b', front: 'Q2', rule: 'R2', example: 'E2', trap: 'T2', state: 'new', updatedAt: '' },
    ],
    generatedAt: '',
  })
  // Default to a benign 404 probe response so the hook lands on idle when
  // no cache row exists. Specific tests override this when they care.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ status: 'none' }),
  }) as any
})

describe('cardsTab', () => {
  const props = { videoId: 'v1', transcript: 'x', transcriptStatus: 'ready' as const }

  it('renders first card front with progress label', async () => {
    render(<CardsTab {...props} />)
    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument())
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
  })

  it('tapping the card flips to back face showing rule + example', async () => {
    render(<CardsTab {...props} />)
    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument())
    const card = screen.getByText('Q1').closest('[data-card]')!
    await userEvent.click(card as HTMLElement)
    expect(screen.getByText('R1')).toBeInTheDocument()
    expect(screen.getByText(/E1/)).toBeInTheDocument()
  })

  it('marking Got it advances to next card', async () => {
    render(<CardsTab {...props} />)
    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /got it/i }))
    await waitFor(() => expect(screen.getByText('Q2')).toBeInTheDocument())
  })

  it('shows generate CTA empty state when deck is empty', async () => {
    // Wipe cards
    await mockDb.value.delete('tip-cards', cardsKey('v1', 'en'))
    render(<CardsTab videoId="v1" transcript="x" transcriptStatus="ready" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /generate cards/i })).toBeInTheDocument())
  })

  it('disabled state when transcript missing', async () => {
    render(<CardsTab videoId="v1" transcript="" transcriptStatus="unavailable" />)
    expect(screen.getByText(/no transcript/i)).toBeInTheDocument()
  })

  it('keyboard: Space flips, ArrowRight advances', async () => {
    render(<CardsTab {...props} />)
    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument())
    const card = screen.getByText('Q1').closest('[data-card]') as HTMLElement
    card.focus()
    await userEvent.keyboard(' ')
    expect(screen.getByText('R1')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByText('Q2')).toBeInTheDocument())
  })
})
