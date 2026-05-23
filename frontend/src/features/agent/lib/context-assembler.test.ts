import type { AgentMemory, LearnerProfile } from '@/db'
import type { SurfaceContext } from '@/features/agent/lib/context-assembler/types'
import { describe, expect, it } from 'vitest'
import { buildGlobalSystemPrompt, buildSystemPrompt } from '@/features/agent/lib/agent-system-prompt'
import { buildPrompt } from '@/features/agent/lib/context-assembler'
import { buildTipSystemPrompt } from '@/features/agent/lib/tipChatPrompt'

const fixedNow = '2026-05-20T12:00:00.000Z'

const profile: LearnerProfile = {
  name: 'Sam',
  nativeLanguage: 'en',
  targetLanguage: 'zh-CN',
  currentLevel: 'HSK 3',
  dailyGoalMinutes: 20,
  currentStreakDays: 4,
  totalSessions: 30,
  totalStudyMinutes: 400,
  lastStudyDate: '2026-05-19',
  profileCreated: '2026-01-01',
}

const memories: AgentMemory[] = [
  { id: 'm1', content: 'likes food topics', tags: ['preference'], importance: 3, createdAt: 0, lastAccessedAt: 0 },
  { id: 'm2', content: 'weak on tones', tags: ['skill'], importance: 2, createdAt: 0, lastAccessedAt: 0 },
]

describe('contextAssembler parity (delegates to legacy builders)', () => {
  it('lesson surface matches buildSystemPrompt', () => {
    const ctx: SurfaceContext = {
      surface: 'lesson',
      threadId: 'lid',
      profile,
      memories: memories.slice(),
      currentTime: fixedNow,
      lesson: {
        lessonId: 'lid',
        lessonTitle: 'Test Lesson',
        activeSegment: null,
        sourceLanguage: 'zh-CN',
        translationLanguage: 'en',
        appState: { currentTab: 'companion', sessionDurationMinutes: 5, exercisesThisSession: 0, recentMistakeWords: [], vocabularyDueCount: 3 },
        accuracy: {},
        deferredToolNames: ['tool_search'],
      },
    }
    const legacy = buildSystemPrompt({
      profile,
      memories: memories.slice(),
      lessonTitle: 'Test Lesson',
      lessonId: 'lid',
      activeSegment: null,
      sourceLanguage: 'zh-CN',
      translationLanguage: 'en',
      currentTime: fixedNow,
      appState: { currentTab: 'companion', sessionDurationMinutes: 5, exercisesThisSession: 0, recentMistakeWords: [], vocabularyDueCount: 3 },
      accuracy: {},
      deferredToolNames: ['tool_search'],
    })
    expect(buildPrompt(ctx)).toBe(legacy)
  })

  it('lesson surface with roleplay prefix matches legacy ordering', () => {
    const ctx: SurfaceContext = {
      surface: 'lesson',
      threadId: 'lid',
      profile,
      memories: [],
      currentTime: fixedNow,
      roleplaySystemPrompt: 'You are a kung-fu master.',
      lesson: {
        lessonId: 'lid',
        appState: { currentTab: 'companion', sessionDurationMinutes: 0, exercisesThisSession: 0, recentMistakeWords: [], vocabularyDueCount: 0 },
        accuracy: {},
      },
    }
    const base = buildSystemPrompt({
      profile,
      memories: [],
      lessonId: 'lid',
      activeSegment: null,
      currentTime: fixedNow,
      appState: { currentTab: 'companion', sessionDurationMinutes: 0, exercisesThisSession: 0, recentMistakeWords: [], vocabularyDueCount: 0 },
      accuracy: {},
    })
    expect(buildPrompt(ctx)).toBe(`You are a kung-fu master.\n\n---\n\n${base}`)
  })

  it('global surface matches buildGlobalSystemPrompt', () => {
    const ctx: SurfaceContext = {
      surface: 'global',
      threadId: '__global',
      profile,
      memories: memories.slice(),
      currentTime: fixedNow,
      global: { chips: [] },
    }
    const legacy = buildGlobalSystemPrompt(profile, memories.slice(), fixedNow)
    expect(buildPrompt(ctx)).toBe(legacy)
  })

  it('tip free mode matches buildTipSystemPrompt', () => {
    const ctx: SurfaceContext = {
      surface: 'tip',
      threadId: 'c:v',
      profile,
      memories: [],
      currentTime: fixedNow,
      tip: { courseId: 'c', videoId: 'v', lessonTitle: 'Tip Lesson', transcript: '[00:01] hello', uiLanguage: 'en', mode: 'free' },
    }
    const legacy = buildTipSystemPrompt({ lessonTitle: 'Tip Lesson', transcript: '[00:01] hello', uiLanguage: 'en', mode: 'free' })
    expect(buildPrompt(ctx)).toBe(legacy)
  })

  it('tip guided mode matches', () => {
    const ctx: SurfaceContext = {
      surface: 'tip',
      threadId: 'c:v',
      profile,
      memories: [],
      currentTime: fixedNow,
      tip: { courseId: 'c', videoId: 'v', lessonTitle: 'Tip Lesson', transcript: '[00:01] hi', uiLanguage: 'vi', mode: 'guided' },
    }
    const legacy = buildTipSystemPrompt({ lessonTitle: 'Tip Lesson', transcript: '[00:01] hi', uiLanguage: 'vi', mode: 'guided' })
    expect(buildPrompt(ctx)).toBe(legacy)
  })
})
