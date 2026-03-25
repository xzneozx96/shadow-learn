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
