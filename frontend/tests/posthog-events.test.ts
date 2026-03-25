import { beforeEach, describe, expect, it, vi } from 'vitest'
import { posthog } from '@/lib/posthog'
import {
  captureAuthEvent,
  captureLessonCreated,
  captureLessonGenerationFailed,
  captureLessonJobFailed,
  captureStudySessionCompleted,
} from '@/lib/posthog-events'

vi.mock('@/lib/posthog', () => ({
  posthog: {
    capture: vi.fn(),
    captureException: vi.fn(),
  },
}))

describe('posthog event schemas', () => {
  beforeEach(() => {
    vi.mocked(posthog.capture).mockClear()
  })

  it('captureStudySessionCompleted sends study_session_completed with all required properties', () => {
    captureStudySessionCompleted({ lesson_id: 'l1', mode: 'mixed', score: 8, total: 10, perfect: false })
    expect(posthog.capture).toHaveBeenCalledWith('study_session_completed', {
      lesson_id: 'l1',
      mode: 'mixed',
      score: 8,
      total: 10,
      perfect: false,
    })
  })

  it('captureLessonGenerationFailed sends lesson_generation_failed with source and error_message', () => {
    captureLessonGenerationFailed({ source: 'youtube', error_message: 'Server error: 500' })
    expect(posthog.capture).toHaveBeenCalledWith('lesson_generation_failed', {
      source: 'youtube',
      error_message: 'Server error: 500',
    })
  })

  it('captureLessonCreated sends lesson_created with source', () => {
    captureLessonCreated({ source: 'upload' })
    expect(posthog.capture).toHaveBeenCalledWith('lesson_created', { source: 'upload' })
  })

  it('captureLessonJobFailed sends lesson_job_failed with step and error_message', () => {
    captureLessonJobFailed({ step: 'transcription', error_message: 'API timeout' })
    expect(posthog.capture).toHaveBeenCalledWith('lesson_job_failed', {
      step: 'transcription',
      error_message: 'API timeout',
    })
  })

  it('captureAuthEvent sends the named event with no extra properties', () => {
    captureAuthEvent('app_unlocked')
    expect(posthog.capture).toHaveBeenCalledWith('app_unlocked')
    captureAuthEvent('trial_started')
    expect(posthog.capture).toHaveBeenCalledWith('trial_started')
  })
})
