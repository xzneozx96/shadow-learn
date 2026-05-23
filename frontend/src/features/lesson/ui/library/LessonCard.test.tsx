import type { LessonMeta } from '@/shared/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonCard } from '@/features/lesson/ui/library/LessonCard'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className, onClick, tabIndex, 'aria-label': ariaLabel }: any) => (
    <a href={to} className={className} onClick={onClick} tabIndex={tabIndex} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}))

vi.mock('@/contexts/I18nContext', async () => {
  const { TRANSLATIONS } = await import('@/shared/lib/i18n')
  return {
    useI18n: () => ({
      locale: 'en' as const,
      setLocale: async () => {},
      t: (key: string) => (TRANSLATIONS.en as Record<string, string>)[key] ?? key,
    }),
  }
})

vi.mock('@/features/vocabulary/application/VocabularyContext', () => ({
  useVocabulary: () => ({ entriesByLesson: {} }),
}))

vi.mock('@/features/lesson/application/useUploadThumbnail', () => ({
  useUploadThumbnail: () => null,
}))

function makeMeta(overrides: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id: 'lesson_1',
    title: 'Test Lesson',
    source: 'upload',
    sourceUrl: null,
    translationLanguages: ['en'],
    createdAt: '2024-01-01T00:00:00.000Z',
    lastOpenedAt: '2024-01-01T00:00:00.000Z',
    progressSegmentId: null,
    tags: [],
    status: 'complete',
    ...overrides,
  }
}

function renderCard(overrides: Partial<LessonMeta> = {}, onToggleDone = vi.fn()) {
  return render(
    <LessonCard
      lesson={makeMeta(overrides)}
      onDelete={vi.fn()}
      onRename={vi.fn()}
      onToggleDone={onToggleDone}
    />,
  )
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: /lesson actions/i })
  fireEvent.click(trigger)
  await waitFor(() => screen.getByText('Mark as Done'))
}

describe('lessonCard — done/in-progress toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Mark as Done" when isDone is falsy', async () => {
    renderCard({ isDone: false })
    fireEvent.click(screen.getByRole('button', { name: /lesson actions/i }))
    await waitFor(() => {
      expect(screen.getByText('Mark as Done')).toBeTruthy()
    })
  })

  it('shows "Mark as Done" when isDone is undefined', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /lesson actions/i }))
    await waitFor(() => {
      expect(screen.getByText('Mark as Done')).toBeTruthy()
    })
  })

  it('shows "Mark as In Progress" when isDone is true', async () => {
    renderCard({ isDone: true })
    fireEvent.click(screen.getByRole('button', { name: /lesson actions/i }))
    await waitFor(() => {
      expect(screen.getByText('Mark as In Progress')).toBeTruthy()
    })
  })

  it('calls onToggleDone with the lesson when menu item clicked', async () => {
    const onToggleDone = vi.fn()
    renderCard({ isDone: false }, onToggleDone)
    await openMenu()
    fireEvent.click(screen.getByText('Mark as Done'))
    expect(onToggleDone).toHaveBeenCalledOnce()
    expect(onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson_1' }))
  })

  it('renders done badge when isDone is true', () => {
    renderCard({ isDone: true })
    expect(screen.getByLabelText('Done')).toBeTruthy()
  })

  it('does not render done badge when isDone is falsy', () => {
    renderCard({ isDone: false })
    expect(screen.queryByLabelText('Done')).toBeNull()
  })

  it('does not render done badge when isDone is undefined', () => {
    renderCard()
    expect(screen.queryByLabelText('Done')).toBeNull()
  })
})
