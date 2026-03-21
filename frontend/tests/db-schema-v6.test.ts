/**
 * Tests for IDB schema v6 migration — agent-memory store and indexes
 * Uses fake-indexeddb.
 */

import type { AgentMemory, ShadowLearnDB } from '@/db'
import { afterEach, describe, expect, it } from 'vitest'
import { getAgentMemoriesByTag, getAllAgentMemories, getLearnerProfile, initDB, saveAgentMemory, saveLearnerProfile } from '@/db'
import 'fake-indexeddb/auto'

let db: ShadowLearnDB

afterEach(() => {
  if (db)
    db.close()
  globalThis.indexedDB = new IDBFactory()
})

describe('schema v6 — agent-memory store', () => {
  it('creates agent-memory store during init', async () => {
    db = await initDB()
    const storeNames = [...db.objectStoreNames]
    expect(storeNames).toContain('agent-memory')
  })

  it('saveAgentMemory + getAllAgentMemories round-trip', async () => {
    db = await initDB()
    const memory: AgentMemory = {
      id: 'test-1',
      content: 'Test memory content',
      tags: ['test', 'unit'],
      importance: 2,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }
    await saveAgentMemory(db, memory)
    const all = await getAllAgentMemories(db)
    expect(all.length).toBe(1)
    expect(all[0].id).toBe('test-1')
    expect(all[0].content).toBe('Test memory content')
    expect(all[0].tags).toEqual(['test', 'unit'])
  })

  it('getAgentMemoriesByTag uses multiEntry index', async () => {
    db = await initDB()
    await saveAgentMemory(db, {
      id: 'a',
      content: 'tagged grammar',
      tags: ['grammar', 'hsk4'],
      importance: 1,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    })
    await saveAgentMemory(db, {
      id: 'b',
      content: 'tagged vocab',
      tags: ['vocab'],
      importance: 1,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    })

    const grammarResults = await getAgentMemoriesByTag(db, 'grammar')
    expect(grammarResults.length).toBe(1)
    expect(grammarResults[0].id).toBe('a')

    const hsk4Results = await getAgentMemoriesByTag(db, 'hsk4')
    expect(hsk4Results.length).toBe(1)
    expect(hsk4Results[0].id).toBe('a')

    const vocabResults = await getAgentMemoriesByTag(db, 'vocab')
    expect(vocabResults.length).toBe(1)
    expect(vocabResults[0].id).toBe('b')

    const noResults = await getAgentMemoriesByTag(db, 'nonexistent')
    expect(noResults.length).toBe(0)
  })
})

describe('learner-profile helpers', () => {
  it('getLearnerProfile returns undefined when no profile', async () => {
    db = await initDB()
    const profile = await getLearnerProfile(db)
    expect(profile).toBeUndefined()
  })

  it('saveLearnerProfile + getLearnerProfile round-trip', async () => {
    db = await initDB()
    await saveLearnerProfile(db, {
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
    })
    const profile = await getLearnerProfile(db)
    expect(profile).toBeDefined()
    expect(profile!.name).toBe('Ross')
    expect(profile!.currentLevel).toBe('intermediate')
    expect(profile!.dailyGoalMinutes).toBe(30)
  })

  it('saveLearnerProfile overwrites existing profile', async () => {
    db = await initDB()
    await saveLearnerProfile(db, {
      name: 'Ross',
      nativeLanguage: 'English',
      targetLanguage: 'Chinese',
      currentLevel: 'beginner',
      dailyGoalMinutes: 15,
      currentStreakDays: 0,
      totalSessions: 0,
      totalStudyMinutes: 0,
      lastStudyDate: null,
      profileCreated: '2026-01-01',
    })
    await saveLearnerProfile(db, {
      name: 'Ross',
      nativeLanguage: 'English',
      targetLanguage: 'Chinese',
      currentLevel: 'advanced',
      dailyGoalMinutes: 60,
      currentStreakDays: 100,
      totalSessions: 200,
      totalStudyMinutes: 6000,
      lastStudyDate: '2026-03-19',
      profileCreated: '2026-01-01',
    })
    const profile = await getLearnerProfile(db)
    expect(profile!.currentLevel).toBe('advanced')
    expect(profile!.dailyGoalMinutes).toBe(60)
  })
})
