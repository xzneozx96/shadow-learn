/**
 * Tests for agent-system-prompt.ts — buildSystemPrompt pure function
 */

import type { AgentMemory, LearnerProfile, ProgressStats } from '@/db'
import type { Segment } from '@/types'
import { describe, expect, it } from 'vitest'
import { buildGlobalSystemPrompt, buildSystemPrompt, clearSystemPromptCache, formatProgressSummary } from '@/lib/agent-system-prompt'

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
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: [] })
    expect(prompt).toContain('## Role')
    expect(prompt).toContain('You are **Zober**')
  })

  it('includes learner profile when provided', () => {
    const prompt = buildSystemPrompt({ profile: mockProfile, activeSegment: null, memories: [] })
    expect(prompt).toContain('## Learner Profile')
    expect(prompt).toContain('intermediate')
    expect(prompt).toContain('Streak: 5d')
    expect(prompt).toContain('Sessions: 42')
  })

  it('omits learner profile when undefined', () => {
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: [] })
    expect(prompt).not.toContain('## Learner Profile')
  })

  it('includes lesson context with id and title when provided', () => {
    const prompt = buildSystemPrompt({ profile: undefined, lessonTitle: 'My Lesson', lessonId: 'lesson-abc', activeSegment: mockSegment, memories: [] })
    expect(prompt).toContain('## Current Lesson')
    expect(prompt).toContain('ID: lesson-abc')
    expect(prompt).toContain('My Lesson')
    expect(prompt).toContain('今天天气很好')
    expect(prompt).toContain('The weather is nice today')
  })

  it('omits lesson context when neither title, id, nor segment', () => {
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: [] })
    expect(prompt).not.toContain('## Current Lesson')
  })

  it('includes memory summary when memories provided', () => {
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: mockMemories })
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
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: fourMemories })
    expect(prompt).not.toContain('Memory four')
  })

  it('always includes instructions', () => {
    const prompt = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: [] })
    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('save_memory')
  })

  it('produces all sections for full input', () => {
    const prompt = buildSystemPrompt({ profile: mockProfile, lessonTitle: 'Lesson Title', lessonId: 'lesson-xyz', activeSegment: mockSegment, memories: mockMemories })
    expect(prompt).toContain('## Role')
    expect(prompt).toContain('## Learner Profile')
    expect(prompt).toContain('## Current Lesson')
    expect(prompt).toContain('ID: lesson-xyz')
    expect(prompt).toContain('## Memory Summary')
    expect(prompt).toContain('## Instructions')
  })

  it('includes today date when provided', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
      currentTime: '2026-04-02',
    })
    expect(prompt).toContain('Today: 2026-04-02')
  })

  it('falls back to current date when today not provided', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
    })
    expect(prompt).toMatch(/Today: \d{4}-\d{2}-\d{2}/)
  })

  it('includes expanded style guidance', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
    })
    expect(prompt).toContain('Lead with the answer or action')
    expect(prompt).toContain('one sentence when possible')
  })

  it('includes tool-use anti-pattern warnings', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
    })
    expect(prompt).toContain('Do not re-call')
    expect(prompt).toContain('speculative data fetching')
  })

  it('does not include the old restrictive single-tool-call instruction', () => {
    const prompt = buildSystemPrompt({ profile: mockProfile, activeSegment: null, memories: [] })
    expect(prompt).not.toContain('After calling tools and receiving results, respond to the user immediately')
    expect(prompt).not.toContain('Call at most 1-2 tools per user message')
  })

  it('includes the chain-tools instruction', () => {
    const prompt = buildSystemPrompt({ profile: mockProfile, activeSegment: null, memories: [] })
    expect(prompt).toContain('Chain tools when needed')
  })
})

describe('buildSystemPrompt — Session Snapshot', () => {
  const appState = {
    currentTab: 'lesson',
    sessionDurationMinutes: 12,
    exercisesThisSession: 3,
    recentMistakeWords: ['你好', '谢谢'],
    vocabularyDueCount: 8,
  }

  const exerciseAccuracy = {
    dictation: { accuracy: 0.6, attempts: 10 },
    translation: { accuracy: 0.8, attempts: 5 },
  }

  it('includes ## Session Snapshot when appState provided', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
      appState,
      accuracy: exerciseAccuracy,
    })
    expect(prompt).toContain('## Session Snapshot')
    expect(prompt).toContain('12min')
    expect(prompt).toContain('Exercises done: 3')
    expect(prompt).toContain('Vocabulary due: 8')
    expect(prompt).toContain('你好')
    expect(prompt).toContain('dictation 60%')
    expect(prompt).toContain('translation 80%')
  })

  it('omits ## Session Snapshot when appState not provided', () => {
    const prompt = buildSystemPrompt({ profile: mockProfile, activeSegment: null, memories: [] })
    expect(prompt).not.toContain('## Session Snapshot')
  })

  it('omits Recent mistakes line when recentMistakeWords is empty', () => {
    const emptyState = { ...appState, recentMistakeWords: [] }
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
      appState: emptyState,
    })
    expect(prompt).not.toContain('Recent mistakes:')
  })

  it('## Session Snapshot appears before ## Instructions', () => {
    const prompt = buildSystemPrompt({
      profile: mockProfile,
      activeSegment: null,
      memories: [],
      appState,
    })
    const snapshotIdx = prompt.indexOf('## Session Snapshot')
    const instructionsIdx = prompt.indexOf('## Instructions')
    expect(snapshotIdx).toBeLessThan(instructionsIdx)
  })
})

describe('buildGlobalSystemPrompt', () => {
  it('includes app-guide role', () => {
    const prompt = buildGlobalSystemPrompt(undefined, [])
    expect(prompt).toContain('Zober')
    expect(prompt).toContain('ShadowLearn')
  })

  it('includes learner profile when provided', () => {
    const profile = {
      name: 'Test',
      nativeLanguage: 'en',
      targetLanguage: 'zh-CN',
      currentLevel: 'Intermediate',
      dailyGoalMinutes: 30,
      currentStreakDays: 5,
      totalSessions: 10,
      createdAt: new Date().toISOString(),
    } as unknown as LearnerProfile
    const prompt = buildGlobalSystemPrompt(profile, [])
    expect(prompt).toContain('Intermediate')
    expect(prompt).toContain('zh-CN')
  })

  it('includes memory summary when provided', () => {
    const memories: AgentMemory[] = [{ id: '1', content: 'Prefers formal tone', tags: [], importance: 1, createdAt: Date.now(), lastAccessedAt: Date.now() }]
    const prompt = buildGlobalSystemPrompt(undefined, memories)
    expect(prompt).toContain('Prefers formal tone')
  })

  it('includes today date', () => {
    const prompt = buildGlobalSystemPrompt(undefined, [])
    expect(prompt).toMatch(/Today: \d{4}-\d{2}-\d{2}/)
  })

  it('includes expanded style guidance', () => {
    const prompt = buildGlobalSystemPrompt(undefined, [])
    expect(prompt).toContain('Lead with the answer or action')
  })

  it('includes tool anti-pattern warning', () => {
    const prompt = buildGlobalSystemPrompt(undefined, [])
    expect(prompt).toContain('Do not re-call')
  })

  it('does NOT include lesson context or exercise instructions', () => {
    const prompt = buildGlobalSystemPrompt(undefined, [])
    expect(prompt).not.toContain('render_study_session')
    expect(prompt).not.toContain('Exercise Rendering')
    expect(prompt).not.toContain('Current Lesson')
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

describe('static prompt cache', () => {
  it('clearSystemPromptCache() does not throw and allows rebuild', () => {
    clearSystemPromptCache()
    const result = buildSystemPrompt({ profile: undefined, activeSegment: null, memories: [] })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(50)
  })

  it('returns same static portion across two calls', () => {
    const ctx = { profile: undefined as any, activeSegment: null, memories: [] }
    const first = buildSystemPrompt(ctx)
    const second = buildSystemPrompt(ctx)
    // Static portion (before ---) should be identical
    expect(first.split('---')[0]).toBe(second.split('---')[0])
  })
})
