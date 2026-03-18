import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'

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

function renderCreateLesson() {
  return render(
    <MemoryRouter>
      <CreateLesson />
    </MemoryRouter>
  )
}

describe('CreateLesson STT key selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends deepgram_api_key when stt_provider is deepgram', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stt_provider: 'deepgram', tts_provider: 'azure' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ job_id: 'job-1' }),
      } as Response)

    renderCreateLesson()

    // Fill YouTube URL and trigger submit
    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [, lessonCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.deepgram_api_key).toBe('dg-key')
      expect(body.azure_speech_key).toBeUndefined()
      expect(body.azure_speech_region).toBeUndefined()
    })
  })

  it('sends azure_speech_key and region when stt_provider is azure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stt_provider: 'azure', tts_provider: 'azure' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ job_id: 'job-2' }),
      } as Response)

    renderCreateLesson()

    await userEvent.type(screen.getByPlaceholderText(/youtube/i), 'https://www.youtube.com/watch?v=abc12345678')
    await userEvent.click(screen.getByRole('button', { name: /generate lesson/i }))

    await waitFor(() => {
      const [, lessonCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const body = JSON.parse(lessonCall[1].body)
      expect(body.azure_speech_key).toBe('az-key')
      expect(body.azure_speech_region).toBe('eastus')
      expect(body.deepgram_api_key).toBeUndefined()
    })
  })
})
