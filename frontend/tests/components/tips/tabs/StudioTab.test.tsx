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

  it('renders Study Guide + Quiz + locked Mind Map (Summary lives in OverviewBlock)', () => {
    render(<StudioTab {...baseProps} />)
    expect(screen.getByRole('heading', { level: 3, name: /study guide/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /quiz/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /mind map/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: /^summary$/i })).not.toBeInTheDocument()
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

  it('clicking Generate on Study Guide tile fires POST /api/tips/studio/study_guide', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ question: 'q', answer: 'a' }, { question: 'q2', answer: 'a2' }, { question: 'q3', answer: 'a3' }] }),
    })
    render(<StudioTab {...baseProps} />)
    const guideGen = screen.getAllByRole('button', { name: /^generate$/i })[0]
    await userEvent.click(guideGen)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tips\/studio\/study_guide$/),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
