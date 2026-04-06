import { posthog } from './posthog'

export function captureStudySessionCompleted(data: {
  lesson_id: string
  mode: string
  score: number
  total: number
  perfect: boolean
}) {
  posthog.capture('study_session_completed', data)
}

export function captureLessonCreated(data: { source: 'youtube' | 'upload' }) {
  posthog.capture('lesson_created', data)
}

export function captureLessonGenerationFailed(data: { source: 'youtube' | 'upload', error_message: string }) {
  posthog.capture('lesson_generation_failed', data)
}

export function captureLessonJobFailed(data: { step: string, error_message: string }) {
  posthog.capture('lesson_job_failed', data)
}

export function captureAuthEvent(event: 'app_unlocked' | 'app_setup_complete' | 'trial_started') {
  posthog.capture(event)
}

export function captureCompanionMessageSent(data: { with_context: boolean, file_count: number }) {
  posthog.capture('companion_message_sent', data)
}

export function captureStudySessionStarted(data: { lesson_id: string, mode: string, count: number }) {
  posthog.capture('study_session_started', data)
}

export function captureExerciseCompleted(data: { exercise_type: string, correct: boolean, score: number }) {
  posthog.capture('exercise_completed', data)
}

export function captureShadowingSessionStarted(data: { mode: 'dictation' | 'speaking', segment_count: number }) {
  posthog.capture('shadowing_session_started', data)
}

export function captureShadowingSessionCompleted(data: { mode: 'dictation' | 'speaking', attempted: number, total: number }) {
  posthog.capture('shadowing_session_completed', data)
}

export function captureVocabularyWordSaved(data: { source_language: string }) {
  posthog.capture('vocabulary_word_saved', data)
}
