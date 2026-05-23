import type { ShadowLearnDB } from '@/db'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initDB } from '@/db'
import { StudioTab } from '@/features/learning-materials/ui/tips/tabs/StudioTab'
import 'fake-indexeddb/auto'

vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

let testDb: ShadowLearnDB | null = null
vi.mock('@/app/providers/AuthContext', () => ({
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
    notes: [],
    notesHydrated: true,
    onCreateNote: vi.fn().mockResolvedValue('note-id'),
    onUpdateNote: vi.fn().mockResolvedValue(undefined),
    onRemoveNote: vi.fn().mockResolvedValue(undefined),
    onDiscussNote: vi.fn(),
  }

  it('renders Study Guide + Flashcards + Mind Map (Summary lives in OverviewBlock)', () => {
    render(<StudioTab {...baseProps} />)
    expect(screen.getByRole('heading', { level: 3, name: /study guide/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /flashcards/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /mind map/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: /^summary$/i })).not.toBeInTheDocument()
  })

  it('mind Map tile renders in empty (unlocked) state when no artifact is cached', () => {
    render(<StudioTab {...baseProps} />)
    const mindMapTile = screen.getByRole('heading', { level: 3, name: /mind map/i }).closest('[data-tile]')
    expect(mindMapTile).toHaveAttribute('data-locked', 'false')
    expect(mindMapTile).toHaveAttribute('data-state', 'empty')
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
    // New tile is a single button whose aria-label combines title + action.
    const guideGen = screen.getByRole('button', { name: /study guide.*generate/i })
    await userEvent.click(guideGen)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tips\/studio\/study_guide$/),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
