import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateLesson } from '@/components/create/CreateLesson'
import { getAppConfig } from '@/lib/config'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

// Minimal auth context mock
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    db: {},
    keys: {
      openrouterApiKey: 'or-key',
      deepgramApiKey: 'dg-key',
      azureSpeechKey: 'az-key',
      azureSpeechRegion: 'eastus',
    },
  }),
}))
vi.mock('@/contexts/LessonsContext', () => ({
  useLessons: () => ({ updateLesson: vi.fn() }),
}))
vi.mock('@/db', () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  saveVideo: vi.fn(),
}))

// Mock getAppConfig so the module-level promise cache doesn't leak between tests
vi.mock('@/lib/config', () => ({
  getAppConfig: vi.fn(),
  API_BASE: 'http://test-api',
}))

function renderCreateLesson() {
  return render(
    <MemoryRouter>
      <CreateLesson />
    </MemoryRouter>,
  )
}

describe('createLesson STT key selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends deepgram_api_key when stt_provider is deepgram', async () => {
    vi.mocked(getAppConfig).mockResolvedValue({ sttProvider: 'deepgram', ttsProvider: 'azure' })
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ job_id: 'job-1' }),
    } as Response)

    renderCreateLesson()

    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    // Wait for sttProvider to load (canGenerate becomes true) before clicking
    await waitFor(() => expect(screen.getByRole('button', { name: /generate lesson/i })).not.toBeDisabled())
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [lessonCall] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.deepgram_api_key).toBe('dg-key')
      expect(body.azure_speech_key).toBeUndefined()
      expect(body.azure_speech_region).toBeUndefined()
    })
  })

  it('sends azure_speech_key and region when stt_provider is azure', async () => {
    vi.mocked(getAppConfig).mockResolvedValue({ sttProvider: 'azure', ttsProvider: 'azure' })
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ job_id: 'job-2' }),
    } as Response)

    renderCreateLesson()

    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    // Wait for sttProvider to load (canGenerate becomes true) before clicking
    await waitFor(() => expect(screen.getByRole('button', { name: /generate lesson/i })).not.toBeDisabled())
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [lessonCall] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.azure_speech_key).toBe('az-key')
      expect(body.azure_speech_region).toBe('eastus')
      expect(body.deepgram_api_key).toBeUndefined()
    })
  })
})
