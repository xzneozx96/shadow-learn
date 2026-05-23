import type { LearnerProfile } from '@/db'
import { describe, expect, it } from 'vitest'
import { buildGlobalSystemPrompt, buildSystemPrompt } from '@/features/agent/lib/agent-system-prompt'

// The system prompt is message[0] — the start of OpenRouter's cacheable prefix.
// It MUST be byte-identical across sends within a session, or every request misses
// the prompt cache. Time is the only per-send volatile field; it's coarsened to date.

const profile: LearnerProfile = {
  name: 'Test',
  nativeLanguage: 'Vietnamese',
  targetLanguage: 'Mandarin Chinese',
  currentLevel: 'Beginner',
  dailyGoalMinutes: 15,
  currentStreakDays: 3,
  totalSessions: 10,
  totalStudyMinutes: 120,
  lastStudyDate: '2026-05-23',
  profileCreated: '2026-05-01',
}

const morning = '2026-05-23T08:00:01.000Z'
const evening = '2026-05-23T22:59:59.000Z'

describe('system prompt prefix stability (prompt caching)', () => {
  it('global prompt is identical for two times on the same date', () => {
    expect(buildGlobalSystemPrompt(profile, [], morning))
      .toBe(buildGlobalSystemPrompt(profile, [], evening))
  })

  it('lesson prompt is identical for two times on the same date', () => {
    expect(buildSystemPrompt({ profile, currentTime: morning }))
      .toBe(buildSystemPrompt({ profile, currentTime: evening }))
  })

  it('global prompt embeds the date (not the time)', () => {
    const out = buildGlobalSystemPrompt(profile, [], morning)
    expect(out).toContain('Current Date: 2026-05-23')
    expect(out).not.toContain('08:00')
  })
})
