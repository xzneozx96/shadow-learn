import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardsTab } from '@/features/learning-materials/ui/tips/tabs/CardsTab'
import { FakeApiClient, fakeDataClient } from '../../../../../../tests/fake-api'

vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

const mockDb = { value: null as any, api: null as unknown as FakeApiClient }
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: mockDb.value }),
}))

const DECK = {
  status: 'ready',
  jobId: 'jc',
  data: {
    cards: [
      { id: 'a', front: 'Q1', rule: 'R1', example: 'E1', trap: null },
      { id: 'b', front: 'Q2', rule: 'R2', example: 'E2', trap: 'T2' },
    ],
  },
}

function serve(body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as any
}

beforeEach(() => {
  mockDb.api = new FakeApiClient()
  mockDb.value = fakeDataClient(mockDb.api)
  serve(DECK)
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

  it('marking Got it advances to next card and saves the mark', async () => {
    render(<CardsTab {...props} />)
    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /got it/i }))
    await waitFor(() => expect(screen.getByText('Q2')).toBeInTheDocument())
    const [stored] = mockDb.api.storeRows<{ states: Record<string, { state: string }> }>('tip-card-states')
    expect(stored.states.Q1.state).toBe('known')
  })

  it('shows generate CTA empty state when the server has no deck', async () => {
    serve({ status: 'none' })
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
