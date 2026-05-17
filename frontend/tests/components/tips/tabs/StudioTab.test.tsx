import type { ShadowLearnDB } from '@/db'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB } from '@/db'
import { StudioTab } from '../../../../src/components/tips/tabs/StudioTab'
import 'fake-indexeddb/auto'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

let testDb: ShadowLearnDB | null = null
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: testDb, keys: null }),
}))

beforeEach(async () => {
  const { deleteDB } = await import('idb')
  testDb?.close()
  testDb = null
  await deleteDB('shadowlearn')
  testDb = await initDB()
  globalThis.fetch = vi.fn() as any
})

describe('studioTab', () => {
  const baseProps = {
    courseId: 'c1',
    videoId: 'v1',
    lessonTitle: 'Lesson 1',
    transcript: 'hello world',
    transcriptStatus: 'ready' as const,
  }

  it('renders a 2x2 tile grid with 4 tiles (Summary, Study Guide, Quiz, Mind Map)', () => {
    render(<StudioTab {...baseProps} />)
    expect(screen.getByRole('heading', { level: 3, name: /summary/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /study guide/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /quiz/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /mind map/i })).toBeInTheDocument()
  })

  it('mind Map tile is locked and shows B3 badge', () => {
    render(<StudioTab {...baseProps} />)
    const mindMapTile = screen.getByRole('heading', { level: 3, name: /mind map/i }).closest('[data-tile]')
    expect(mindMapTile).toHaveAttribute('data-locked', 'true')
    expect(screen.getByText('B3')).toBeInTheDocument()
  })

  it('shows disabled state on tiles when transcriptStatus = unavailable', () => {
    render(<StudioTab {...baseProps} transcript="" transcriptStatus="unavailable" />)
    expect(screen.getByText(/no transcript/i)).toBeInTheDocument()
  })

  it('clicking Generate on Summary tile fires POST /api/tips/studio/summary', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ abstract: 'abs', takeaways: ['a', 'b', 'c'] }),
    })
    render(<StudioTab {...baseProps} />)
    const summaryGen = screen.getAllByRole('button', { name: /^generate$/i })[0]
    await userEvent.click(summaryGen)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tips\/studio\/summary$/),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
