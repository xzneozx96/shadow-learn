import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateLesson } from '@/features/lesson/ui/create/CreateLesson'

vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

vi.mock('@/features/speak/application/SpeakModalContext', () => ({
  useSpeakModal: vi.fn(() => ({
    isOpen: false,
    openSpeakModal: vi.fn(),
    closeSpeakModal: vi.fn(),
  })),
}))

vi.mock('@/features/agent/application/GlobalCompanionContext', () => ({
  useGlobalCompanionContext: () => ({
    messages: [],
    input: '',
    isLoading: false,
    sendMessage: vi.fn(),
  }),
}))

// Minimal auth context mock
vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ db: {} }),
}))
vi.mock('@/features/lesson/application/LessonsContext', () => ({
  useLessons: () => ({ updateLesson: vi.fn() }),
}))
vi.mock('@/db', () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  saveVideo: vi.fn(),
}))

vi.mock('@/shared/lib/config', () => ({
  API_BASE: 'http://test-api',
}))

function renderCreateLesson() {
  return render(
    <MemoryRouter>
      <CreateLesson />
    </MemoryRouter>,
  )
}

function mockJobResponse() {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ job_id: 'job-1' }),
  } as Response)
}

function sentBody() {
  const [lessonCall] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
  return JSON.parse(lessonCall[1].body)
}

describe('createLesson request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a youtube lesson without any provider key field', async () => {
    mockJobResponse()
    renderCreateLesson()

    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(Object.keys(sentBody()).sort()).toEqual(['source', 'source_language', 'translation_languages', 'youtube_url'])
  })

  it('sends a blog lesson without any provider key field', async () => {
    mockJobResponse()
    renderCreateLesson()

    await userEvent.click(screen.getByTestId('create-lesson-blog-tab'))
    await userEvent.type(screen.getByPlaceholderText('https://...'), 'https://example.com/post')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(Object.keys(sentBody()).sort()).toEqual(['blog_url', 'minimax_voice_id', 'source', 'source_language', 'translation_languages'])
  })
})
