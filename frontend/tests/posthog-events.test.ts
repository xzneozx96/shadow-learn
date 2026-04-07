import { beforeEach, describe, expect, it, vi } from 'vitest'
import { posthog } from '@/lib/posthog'
import {
  captureAuthEvent,
  captureCompanionMessageSent,
  captureExerciseCompleted,
  captureLessonCreated,
  captureLessonGenerationFailed,
  captureLessonJobFailed,
  captureShadowingSessionCompleted,
  captureShadowingSessionStarted,
  captureStudySessionCompleted,
  captureStudySessionStarted,
  captureVocabularyWordSaved,
  captureWhatsNewChangelogOpened,
  captureWhatsNewModalDismissed,
  captureWhatsNewModalShown,
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

  it('captureCompanionMessageSent sends companion_message_sent with context and file count', () => {
    captureCompanionMessageSent({ with_context: true, file_count: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('companion_message_sent', { with_context: true, file_count: 2 })
  })

  it('captureStudySessionStarted sends study_session_started with lesson, mode, and count', () => {
    captureStudySessionStarted({ lesson_id: 'l1', mode: 'mixed', count: 10 })
    expect(posthog.capture).toHaveBeenCalledWith('study_session_started', { lesson_id: 'l1', mode: 'mixed', count: 10 })
  })

  it('captureExerciseCompleted sends exercise_completed with type, correct, and score', () => {
    captureExerciseCompleted({ exercise_type: 'cloze', correct: true, score: 80 })
    expect(posthog.capture).toHaveBeenCalledWith('exercise_completed', { exercise_type: 'cloze', correct: true, score: 80 })
  })

  it('captureShadowingSessionStarted sends shadowing_session_started with mode and segment count', () => {
    captureShadowingSessionStarted({ mode: 'dictation', segment_count: 15 })
    expect(posthog.capture).toHaveBeenCalledWith('shadowing_session_started', { mode: 'dictation', segment_count: 15 })
  })

  it('captureShadowingSessionCompleted sends shadowing_session_completed with mode, attempted, and total', () => {
    captureShadowingSessionCompleted({ mode: 'speaking', attempted: 10, total: 15 })
    expect(posthog.capture).toHaveBeenCalledWith('shadowing_session_completed', { mode: 'speaking', attempted: 10, total: 15 })
  })

  it('captureVocabularyWordSaved sends vocabulary_word_saved with source language', () => {
    captureVocabularyWordSaved({ source_language: 'zh-CN' })
    expect(posthog.capture).toHaveBeenCalledWith('vocabulary_word_saved', { source_language: 'zh-CN' })
  })

  it('captureWhatsNewModalShown sends whats_new_modal_shown with announcement_id and locale', () => {
    captureWhatsNewModalShown({ announcement_id: '2026-04-workbook-srs', locale: 'en' })
    expect(posthog.capture).toHaveBeenCalledWith('whats_new_modal_shown', {
      announcement_id: '2026-04-workbook-srs',
      locale: 'en',
    })
  })

  it('captureWhatsNewModalDismissed sends whats_new_modal_dismissed with announcement_id and locale', () => {
    captureWhatsNewModalDismissed({ announcement_id: '2026-04-workbook-srs', locale: 'vi' })
    expect(posthog.capture).toHaveBeenCalledWith('whats_new_modal_dismissed', {
      announcement_id: '2026-04-workbook-srs',
      locale: 'vi',
    })
  })

  it('captureWhatsNewChangelogOpened sends whats_new_changelog_opened with announcement_id, locale, and source', () => {
    captureWhatsNewChangelogOpened({ announcement_id: '2026-04-workbook-srs', locale: 'en', source: 'modal' })
    expect(posthog.capture).toHaveBeenCalledWith('whats_new_changelog_opened', {
      announcement_id: '2026-04-workbook-srs',
      locale: 'en',
      source: 'modal',
    })
  })
})
