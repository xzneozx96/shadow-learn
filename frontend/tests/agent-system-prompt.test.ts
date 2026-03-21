/**
 * Tests for agent-system-prompt.ts — buildSystemPrompt pure function
 */

import type { AgentMemory, LearnerProfile, ProgressStats } from '@/db'
import type { Segment } from '@/types'
import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, formatProgressSummary } from '@/lib/agent-system-prompt'

const mockProfile: LearnerProfile = {
  name: 'Ross',
  nativeLanguage: 'English',
  targetLanguage: 'Chinese',
  currentLevel: 'intermediate',
  dailyGoalMinutes: 30,
  currentStreakDays: 5,
  totalSessions: 42,
  totalStudyMinutes: 600,
  lastStudyDate: '2026-03-19',
  profileCreated: '2026-01-01',
}

const mockSegment: Segment = {
  id: 'seg-1',
  start: 0,
  end: 3,
  text: '今天天气很好',
  romanization: 'jīntiān tiānqì hěn hǎo',
  translations: { en: 'The weather is nice today' },
  words: [],
}

const mockMemories: AgentMemory[] = [
  {
    id: 'mem-1',
    content: 'User struggles with tone 3 sandhi',
    tags: ['pronunciation', 'tones'],
    importance: 3,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  },
  {
    id: 'mem-2',
    content: 'User prefers dictation exercises',
    tags: ['preferences'],
    importance: 2,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  },
]

describe('buildSystemPrompt', () => {
  it('includes role section', () => {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, [])
    expect(prompt).toContain('## Role')
    expect(prompt).toContain('Expert language tutor for Shadowing Companion')
  })

  it('includes learner profile when provided', () => {
    const prompt = buildSystemPrompt(mockProfile, undefined, undefined, null, [])
    expect(prompt).toContain('## Learner Profile')
    expect(prompt).toContain('intermediate')
    expect(prompt).toContain('Streak: 5d')
    expect(prompt).toContain('Sessions: 42')
  })

  it('omits learner profile when undefined', () => {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, [])
    expect(prompt).not.toContain('## Learner Profile')
  })

  it('includes lesson context with id and title when provided', () => {
    const prompt = buildSystemPrompt(undefined, 'My Lesson', 'lesson-abc', mockSegment, [])
    expect(prompt).toContain('## Current Lesson')
    expect(prompt).toContain('ID: lesson-abc')
    expect(prompt).toContain('My Lesson')
    expect(prompt).toContain('今天天气很好')
    expect(prompt).toContain('The weather is nice today')
  })

  it('omits lesson context when neither title, id, nor segment', () => {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, [])
    expect(prompt).not.toContain('## Current Lesson')
  })

  it('includes memory summary when memories provided', () => {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, mockMemories)
    expect(prompt).toContain('## Memory Summary')
    expect(prompt).toContain('tone 3 sandhi')
    expect(prompt).toContain('dictation exercises')
  })

  it('limits memories to 3', () => {
    const fourMemories: AgentMemory[] = [
      ...mockMemories,
      { id: 'mem-3', content: 'Memory three', tags: [], importance: 1, createdAt: Date.now(), lastAccessedAt: Date.now() },
      { id: 'mem-4', content: 'Memory four', tags: [], importance: 1, createdAt: Date.now(), lastAccessedAt: Date.now() },
    ]
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, fourMemories)
    expect(prompt).not.toContain('Memory four')
  })

  it('always includes instructions', () => {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, null, [])
    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('save_memory')
  })

  it('produces all sections for full input', () => {
    const prompt = buildSystemPrompt(mockProfile, 'Lesson Title', 'lesson-xyz', mockSegment, mockMemories)
    expect(prompt).toContain('## Role')
    expect(prompt).toContain('## Learner Profile')
    expect(prompt).toContain('## Current Lesson')
    expect(prompt).toContain('ID: lesson-xyz')
    expect(prompt).toContain('## Memory Summary')
    expect(prompt).toContain('## Instructions')
  })
})

describe('formatProgressSummary', () => {
  it('formats stats correctly', () => {
    const stats: ProgressStats = {
      totalSessions: 10,
      totalExercises: 50,
      totalCorrect: 40,
      totalIncorrect: 10,
      accuracyRate: 0.8,
      totalStudyMinutes: 120,
      accuracyTrend: [],
      skillProgress: {
        writing: { sessions: 0, accuracy: 0, lastPracticed: null },
        speaking: { sessions: 0, accuracy: 0, lastPracticed: null },
        vocabulary: { sessions: 0, accuracy: 0, lastPracticed: null },
        reading: { sessions: 0, accuracy: 0, lastPracticed: null },
        listening: { sessions: 0, accuracy: 0, lastPracticed: null },
      },
    }
    const result = formatProgressSummary(stats)
    expect(result).toContain('Accuracy: 80%')
    expect(result).toContain('Sessions: 10')
    expect(result).toContain('40 correct')
    expect(result).toContain('120min')
  })
})
