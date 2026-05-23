import { describe, expect, it } from 'vitest'
import { isSessionCompletePayload } from './study-utils'

describe('isSessionCompletePayload', () => {
  it('returns true for a valid payload', () => {
    const payload = {
      type: 'study_session_complete',
      results: [
        {
          type: 'exercise_result',
          exercise: 'pronunciation',
          vocabId: 'v1',
          word: 'hello',
          score: 95,
          correct: true,
        },
      ],
    }
    expect(isSessionCompletePayload(payload)).toBe(true)
  })

  it('returns true for a payload with empty results', () => {
    const payload = {
      type: 'study_session_complete',
      results: [],
    }
    expect(isSessionCompletePayload(payload)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isSessionCompletePayload(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSessionCompletePayload(undefined)).toBe(false)
  })

  it('returns false for a string', () => {
    expect(isSessionCompletePayload('study_session_complete')).toBe(false)
  })

  it('returns false for an object missing type', () => {
    const payload = {
      results: [],
    }
    expect(isSessionCompletePayload(payload)).toBe(false)
  })

  it('returns false for an object with incorrect type', () => {
    const payload = {
      type: 'other_type',
      results: [],
    }
    expect(isSessionCompletePayload(payload)).toBe(false)
  })

  it('returns false for an object missing results', () => {
    const payload = {
      type: 'study_session_complete',
    }
    expect(isSessionCompletePayload(payload)).toBe(false)
  })

  it('returns false for an object where results is not an array', () => {
    const payload = {
      type: 'study_session_complete',
      results: {},
    }
    expect(isSessionCompletePayload(payload)).toBe(false)
  })
})
