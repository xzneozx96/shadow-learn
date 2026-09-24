import type { AgentMemory, DataClient, ErrorPattern, SpacedRepetitionItem, SpeakSession } from '@/db'
import type { UserMaterial } from '@/features/learning-materials/domain/collection'
import type { TipNote, TipProgress } from '@/features/learning-materials/domain/tips'
import type { ShadowingBest, VocabEntry } from '@/shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiClient,
  deleteAgentMemory,
  deleteDailyTask,
  deleteErrorPattern,
  deleteFullLesson,
  deleteSpacedRepetitionItem,
  deleteSpeakingBestsByLesson,
  deleteTipNote,
  deleteUserMaterial,
  deleteVocabEntry,
  deleteWordStory,
  getAgentMemoriesByTag,
  getAgentMemory,
  getAllAgentMemories,
  getAllExerciseStats,
  getAllSessionLogs,
  getAllSpeakingBestsByLesson,
  getAllTipProgress,
  getAllVocabEntries,
  getDailyTasks,
  getDueItems,
  getErrorPattern,
  getExerciseAccuracy,
  getLearnerProfile,
  getMasteryData,
  getProgressStats,
  getRecentMistakes,
  getSpacedRepetitionItem,
  getSpeakingAudio,
  getSpeakingBest,
  getTipCardStates,
  getTipNotesForVideo,
  getTipProgress,
  getUserMaterialByExternalId,
  getVocabEntriesByLesson,
  getVocabEntryById,
  getWordStory,
  listTipProgressForCourse,
  listUserMaterials,
  putTipCardStates,
  putTipNote,
  putTipProgress,
  putUserMaterial,
  saveAgentMemory,
  saveDailyTask,
  saveErrorPattern,
  saveLearnerProfile,
  saveMasteryData,
  saveProgressStats,
  saveSessionLog,
  saveSpacedRepetitionItem,
  saveSpeakingAudio,
  saveSpeakingBest,
  saveVocabEntry,
  saveWordStory,
  upsertExerciseStat,
} from '@/db'
import {
  getAllSpeakSessions,
  getRecentSpeakSessions,
  getSpeakProgress,
  getSpeakSession,
  saveSpeakSession,
} from '@/features/speak/adapters/speakSessions'
import { FakeApiClient, fakeDataClient } from './fake-api'

let api: FakeApiClient
let db: DataClient

beforeEach(() => {
  api = new FakeApiClient()
  db = fakeDataClient(api)
})

function requests() {
  return api.calls.map(c => `${c.method} ${c.path}`)
}

function vocab(id: string, lessonId = 'L1'): VocabEntry {
  return {
    id,
    word: `词${id}`,
    romanization: 'cí',
    meaning: 'word',
    usage: '',
    sourceLessonId: lessonId,
    sourceLessonTitle: 'Lesson',
    sourceSegmentId: 's1',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-09-24T00:00:00.000Z',
  }
}

function srItem(itemId: string, dueDate: string): SpacedRepetitionItem {
  return {
    itemId,
    itemType: 'vocabulary',
    easinessFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    masteryLevel: 0,
    dueDate,
    lastReviewed: null,
    reviewHistory: [],
  }
}

function best(lessonId: string, segmentId: string, score = 80): ShadowingBest {
  return {
    lessonId,
    segmentId,
    score,
    breakdown: { overall: { accuracy: score, fluency: 90, completeness: 100, prosody: 70 }, words: [] },
    recordedAt: '2026-09-24T00:00:00.000Z',
  }
}

describe('vocabulary', () => {
  it('saves, lists, filters by lesson, reads by id, and deletes', async () => {
    await saveVocabEntry(db, vocab('v1'))
    await saveVocabEntry(db, vocab('v2', 'L2'))

    expect((await getAllVocabEntries(db)).map(e => e.id)).toEqual(['v1', 'v2'])
    expect((await getVocabEntriesByLesson(db, 'L2')).map(e => e.id)).toEqual(['v2'])
    expect((await getVocabEntryById(db, 'v1'))?.word).toBe('词v1')

    await deleteVocabEntry(db, 'v1')
    expect(await getVocabEntryById(db, 'v1')).toBeUndefined()
    expect(requests()).toEqual([
      'PUT /api/store/vocabulary/v1',
      'PUT /api/store/vocabulary/v2',
      'GET /api/store/vocabulary',
      'GET /api/store/vocabulary?index=by-lesson&value=L2',
      'GET /api/store/vocabulary/v1',
      'DELETE /api/store/vocabulary/v1',
      'GET /api/store/vocabulary/v1',
    ])
  })
})

describe('spaced repetition', () => {
  it('getDueItems asks the by-due index for items due on or before today', async () => {
    api.seedStore('spaced-repetition', [
      srItem('yesterday', '2026-09-23'),
      srItem('today', '2026-09-24'),
      srItem('tomorrow', '2026-09-25'),
    ])

    const due = await getDueItems(db, '2026-09-24')

    expect(due.map(i => i.itemId).sort()).toEqual(['today', 'yesterday'])
    expect(requests()).toEqual(['GET /api/store/spaced-repetition?index=by-due&value=2026-09-24&op=lte'])
  })

  it('round-trips and deletes an item by itemId', async () => {
    await saveSpacedRepetitionItem(db, srItem('w1', '2026-09-24'))
    expect((await getSpacedRepetitionItem(db, 'w1'))?.dueDate).toBe('2026-09-24')

    await deleteSpacedRepetitionItem(db, 'w1')
    expect(await getSpacedRepetitionItem(db, 'w1')).toBeUndefined()
    await expect(deleteSpacedRepetitionItem(db, 'missing')).resolves.toBeUndefined()
  })
})

describe('singletons', () => {
  it('progress, mastery, and learner profile use their fixed ids', async () => {
    expect(await getProgressStats(db)).toBeUndefined()

    const progress = { totalSessions: 1, totalExercises: 2, totalCorrect: 1, totalIncorrect: 1, accuracyRate: 0.5, totalStudyMinutes: 3, accuracyTrend: [], skillProgress: {} as any }
    await saveProgressStats(db, progress)
    await saveMasteryData(db, { writing: { masteryLevel: 1, confidenceScore: 0.5, totalPracticeTime: 1, lastPracticed: null } } as any)
    await saveLearnerProfile(db, { name: 'Ross', nativeLanguage: 'English', targetLanguage: 'Chinese', currentLevel: 'advanced', dailyGoalMinutes: 60, currentStreakDays: 0, totalSessions: 0, totalStudyMinutes: 0, lastStudyDate: null, profileCreated: '2026-01-01' })

    expect(await getProgressStats(db)).toEqual(progress)
    expect((await getMasteryData(db))?.writing.masteryLevel).toBe(1)
    expect((await getLearnerProfile(db))?.currentLevel).toBe('advanced')
    expect(requests().filter(r => r.startsWith('PUT'))).toEqual([
      'PUT /api/store/progress-db/global',
      'PUT /api/store/mastery-db/global',
      'PUT /api/store/learner-profile/profile',
    ])
  })
})

describe('mistakes', () => {
  const pattern = (patternId: string, lastOccurred: string): ErrorPattern => ({ patternId, frequency: 1, lastOccurred, examples: [] })

  it('getRecentMistakes sorts by lastOccurred descending and applies the limit', async () => {
    api.seedStore('mistakes-db', [pattern('a', '2026-09-01'), pattern('b', '2026-09-03'), pattern('c', '2026-09-02')])

    expect((await getRecentMistakes(db, 2)).map(m => m.patternId)).toEqual(['b', 'c'])
  })

  it('deleting one pattern leaves agent-created err-word patterns alone', async () => {
    await saveErrorPattern(db, pattern('entry-1', '2026-09-01'))
    await saveErrorPattern(db, pattern('err-好', '2026-09-01'))

    await deleteErrorPattern(db, 'entry-1')

    expect(await getErrorPattern(db, 'entry-1')).toBeUndefined()
    expect(await getErrorPattern(db, 'err-好')).toBeDefined()
  })
})

describe('session logs', () => {
  it('saves by sessionId and lists them', async () => {
    await saveSessionLog(db, { sessionId: 's1', date: '2026-09-24', durationMinutes: 5, skillPracticed: 'speaking', exercisesCompleted: 1, exercisesCorrect: 1, accuracy: 1, itemsMastered: [] })

    expect((await getAllSessionLogs(db)).map(l => l.sessionId)).toEqual(['s1'])
    expect(api.calls[0].path).toBe('/api/store/session-logs/s1')
  })
})

describe('agent memory', () => {
  const memory = (id: string, tags: string[]): AgentMemory => ({ id, content: id, tags, importance: 1, createdAt: 1, lastAccessedAt: 1 })

  it('round-trips, filters by tag through the tags index, and deletes', async () => {
    await saveAgentMemory(db, memory('a', ['grammar', 'hsk4']))
    await saveAgentMemory(db, memory('b', ['vocab']))

    expect((await getAgentMemory(db, 'a'))?.tags).toEqual(['grammar', 'hsk4'])
    expect(await getAllAgentMemories(db)).toHaveLength(2)
    api.calls = []
    expect((await getAgentMemoriesByTag(db, 'hsk4')).map(m => m.id)).toEqual(['a'])
    expect(await getAgentMemoriesByTag(db, 'nonexistent')).toEqual([])
    expect(api.calls[0].path).toBe('/api/store/agent-memory?index=tags&value=hsk4')

    await deleteAgentMemory(db, 'a')
    expect(await getAgentMemory(db, 'a')).toBeUndefined()
  })
})

describe('exercise stats', () => {
  it('upsertExerciseStat writes vocabId and exerciseType into the body and counts attempts', async () => {
    await upsertExerciseStat(db, { vocabId: 'vocab-1', exerciseType: 'dictation' }, true)
    await upsertExerciseStat(db, { vocabId: 'vocab-1', exerciseType: 'dictation' }, false)
    await upsertExerciseStat(db, { vocabId: 'vocab-1', exerciseType: 'dictation' }, true)

    const [stat] = await getAllExerciseStats(db)
    expect(stat).toMatchObject({ vocabId: 'vocab-1', exerciseType: 'dictation', correct: 2, total: 3 })
    expect(api.calls.find(c => c.method === 'PUT')?.path).toBe('/api/store/exercise-stats/vocab-1%3Adictation')
  })

  it('getExerciseAccuracy aggregates by exercise type', async () => {
    await upsertExerciseStat(db, { vocabId: 'vocab-1', exerciseType: 'dictation' }, true)
    await upsertExerciseStat(db, { vocabId: 'vocab-2', exerciseType: 'dictation' }, false)
    await upsertExerciseStat(db, { vocabId: 'vocab-1', exerciseType: 'translation' }, true)

    expect(await getExerciseAccuracy(db)).toEqual({
      dictation: { accuracy: 0.5, attempts: 2 },
      translation: { accuracy: 1, attempts: 1 },
    })
  })

  it('getExerciseAccuracy is empty without stats', async () => {
    expect(await getExerciseAccuracy(db)).toEqual({})
  })
})

describe('word stories', () => {
  it('saves, reads, and deletes a user story keyed by word and language', async () => {
    expect(await getWordStory(db, '练习', 'vi')).toBeUndefined()

    await saveWordStory(db, '练习', 'vi', 'Người thợ kéo sợi tơ')

    expect(await getWordStory(db, '练习', 'vi')).toMatchObject({ word: '练习', lang: 'vi', story: 'Người thợ kéo sợi tơ' })
    expect(await getWordStory(db, '练习', 'en')).toBeUndefined()
    await deleteWordStory(db, '练习', 'vi')
    expect(await getWordStory(db, '练习', 'vi')).toBeUndefined()
    expect(api.calls.find(c => c.method === 'PUT')?.path).toBe(`/api/store/word-stories/${encodeURIComponent('练习:vi')}`)
  })

  it('keeps one story per language for the same word', async () => {
    await saveWordStory(db, '练习', 'vi', 'Chuyện')
    await saveWordStory(db, '练习', 'en', 'Story')

    expect((await getWordStory(db, '练习', 'vi'))?.story).toBe('Chuyện')
    expect((await getWordStory(db, '练习', 'en'))?.story).toBe('Story')
  })
})

describe('shadowing bests', () => {
  it('saves under `<lessonId>:<segmentId>` and lists by lesson', async () => {
    await saveSpeakingBest(db, best('lesson-1', 'seg-1', 88))
    await saveSpeakingBest(db, best('lesson-1', 'seg-2'))
    await saveSpeakingBest(db, best('lesson-2', 'seg-1'))

    expect((await getSpeakingBest(db, 'lesson-1', 'seg-1'))?.score).toBe(88)
    expect((await getAllSpeakingBestsByLesson(db, 'lesson-1')).map(b => b.segmentId)).toEqual(['seg-1', 'seg-2'])
    expect(api.calls[0].path).toBe('/api/store/shadowing-bests/lesson-1%3Aseg-1')
  })

  it('deleteSpeakingBestsByLesson uses the delete-by-index route and keeps other lessons', async () => {
    await saveSpeakingBest(db, best('lesson-1', 'seg-1'))
    await saveSpeakingBest(db, best('lesson-2', 'seg-1'))
    api.calls = []

    await deleteSpeakingBestsByLesson(db, 'lesson-1')

    expect(requests()).toEqual(['DELETE /api/store/shadowing-bests?index=by-lesson&value=lesson-1'])
    expect(await getSpeakingBest(db, 'lesson-1', 'seg-1')).toBeUndefined()
    expect(await getSpeakingBest(db, 'lesson-2', 'seg-1')).toBeDefined()
  })

  it('deleteFullLesson clears the lesson bests alongside the lesson', async () => {
    api.seedLesson({ id: 'lesson-1' } as any)
    await saveSpeakingBest(db, best('lesson-1', 'seg-1'))

    await deleteFullLesson(db, 'lesson-1')

    expect(requests()).toEqual(expect.arrayContaining([
      'DELETE /api/lessons/lesson-1',
      'DELETE /api/store/shadowing-bests?index=by-lesson&value=lesson-1',
    ]))
    expect(await getSpeakingBest(db, 'lesson-1', 'seg-1')).toBeUndefined()
  })
})

describe('shadowing audio', () => {
  const path = '/api/lessons/lesson-1/segments/seg-1/shadowing-audio'

  it('uploads the raw recording with its audio content type', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ id: 'm', size: 5, sha256: 'x', url: '/api/media/m' })))
    const blob = new Blob(['audio'], { type: 'audio/webm' })

    await saveSpeakingAudio({ api: createApiClient(send) }, 'lesson-1', 'seg-1', blob)

    expect(send).toHaveBeenCalledWith(path, { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: blob })
  })

  it('reads the recording back as a Blob and returns undefined when there is none', async () => {
    expect(await getSpeakingAudio(db, 'lesson-1', 'seg-1')).toBeUndefined()

    await saveSpeakingAudio(db, 'lesson-1', 'seg-1', new Blob(['audio'], { type: 'audio/webm' }))
    const audio = await getSpeakingAudio(db, 'lesson-1', 'seg-1')

    expect(await audio?.text()).toBe('audio')
    expect(requests()).toEqual([`GET ${path}`, `PUT ${path}`, `GET ${path}`])
  })

  it('surfaces a failed upload', async () => {
    api.failWith(path, 413)
    await expect(saveSpeakingAudio(db, 'lesson-1', 'seg-1', new Blob(['x'], { type: 'audio/webm' }))).rejects.toThrow()
  })
})

describe('daily tasks', () => {
  it('saves, lists, and deletes by id', async () => {
    await saveDailyTask(db, { id: 't1', title: 'Review', createdDate: '2026-09-24', completedDate: null })
    expect((await getDailyTasks(db)).map(t => t.title)).toEqual(['Review'])

    await deleteDailyTask(db, 't1')
    expect(await getDailyTasks(db)).toEqual([])
  })
})

describe('tip progress', () => {
  const progress = (courseId: string, videoId: string): TipProgress => ({
    key: `${courseId}:${videoId}`,
    courseId,
    videoId,
    watchedSec: 0,
    totalSec: 100,
    completed: false,
    completedAt: null,
    lastSeenAt: '2026-09-24T00:00:00.000Z',
  })

  it('reads by key, lists by course through by-course, and lists all', async () => {
    await putTipProgress(db, progress('PL123', 'v1'))
    await putTipProgress(db, progress('PL123', 'v2'))
    await putTipProgress(db, progress('OTHER', 'v1'))

    expect((await getTipProgress(db, 'PL123:v1'))?.videoId).toBe('v1')
    expect(await getTipProgress(db, 'NOPE:NOPE')).toBeUndefined()
    api.calls = []
    expect((await listTipProgressForCourse(db, 'PL123')).map(r => r.videoId)).toEqual(['v1', 'v2'])
    expect(requests()).toEqual(['GET /api/store/tip-progress?index=by-course&value=PL123'])
    expect(await getAllTipProgress(db)).toHaveLength(3)
  })
})

describe('tip card states', () => {
  it('stores one record per video and locale', async () => {
    const record = { videoId: 'vid', locale: 'en' as const, states: { 'What is a tone?': { state: 'known' as const, updatedAt: '2026-09-24' } } }

    await putTipCardStates(db, record)

    expect(await getTipCardStates(db, 'vid', 'en')).toEqual(record)
    expect(await getTipCardStates(db, 'vid', 'vi')).toBeUndefined()
    expect(api.calls[0].path).toBe('/api/store/tip-card-states/vid%3Aen')
  })
})

describe('tip notes', () => {
  const note = (id: string, videoId: string, updatedAt = '2026-05-19T10:00:00.000Z'): TipNote => ({
    id,
    videoId,
    title: 'My note',
    html: '<p>body</p>',
    createdAt: '2026-05-19T10:00:00.000Z',
    updatedAt,
    source: 'freeform',
  })

  it('keys notes `<videoId>:<id>` and lists one video newest first', async () => {
    await putTipNote(db, note('old', 'vid-1', '2026-05-01T00:00:00.000Z'))
    await putTipNote(db, note('new', 'vid-1', '2026-05-19T00:00:00.000Z'))
    await putTipNote(db, note('other', 'vid-2'))

    expect((await getTipNotesForVideo(db, 'vid-1')).map(n => n.id)).toEqual(['new', 'old'])
    expect(api.calls[0].path).toBe('/api/store/tip-notes/vid-1%3Aold')
  })

  it('deleteTipNote removes the row', async () => {
    await putTipNote(db, note('gone', 'vid-1'))
    await deleteTipNote(db, 'vid-1', 'gone')
    expect(await getTipNotesForVideo(db, 'vid-1')).toEqual([])
  })
})

describe('user materials', () => {
  const material: UserMaterial = {
    id: 'uuid-1',
    source: 'playlist',
    externalId: 'PLabc123',
    name: 'My Test Playlist',
    skill: 'Grammar',
    instructionLanguage: 'English',
    contentType: 'tip',
    cachedMeta: { thumbnailUrl: null, channel: null, videoCount: null, publishedAt: null, duration: null, viewCount: null },
    createdAt: '2026-05-20T00:00:00.000Z',
  }

  it('lists, looks up by externalId through by-external, and deletes', async () => {
    await putUserMaterial(db, material)

    expect((await listUserMaterials(db)).map(m => m.externalId)).toEqual(['PLabc123'])
    api.calls = []
    expect((await getUserMaterialByExternalId(db, 'PLabc123'))?.id).toBe('uuid-1')
    expect(await getUserMaterialByExternalId(db, 'PLmissing')).toBeUndefined()
    expect(api.calls[0].path).toBe('/api/store/user-materials?index=by-external&value=PLabc123')

    await deleteUserMaterial(db, 'uuid-1')
    expect(await listUserMaterials(db)).toEqual([])
  })
})

describe('speak sessions', () => {
  const session = (sessionId: string, startedAt: string, status: SpeakSession['status'] = 'completed'): SpeakSession => ({
    sessionId,
    lessonId: 'L1',
    startedAt,
    endedAt: null,
    durationSeconds: 120,
    status,
    transcript: [{ id: 't', role: 'user', content: '你好', timestamp: startedAt }],
    transcriptText: '',
    evaluation: null,
    promptVersion: 'v2',
    modelId: 'gemini',
    targetLanguage: 'zh-CN',
    proficiencyLevel: 'beginner',
    levelLabel: 'HSK1',
    situationTitle: 'Greeting',
    userGoal: 'Say hi',
  })

  it('saves by sessionId, reads back, and lists recent sessions newest first', async () => {
    await saveSpeakSession(db, session('a', '2026-09-20T10:00:00Z'))
    await saveSpeakSession(db, session('b', '2026-09-22T10:00:00Z'))

    expect((await getSpeakSession(db, 'a'))?.startedAt).toBe('2026-09-20T10:00:00Z')
    expect(await getAllSpeakSessions(db)).toHaveLength(2)
    expect((await getRecentSpeakSessions(db, 1)).map(s => s.sessionId)).toEqual(['b'])
    expect(api.calls[0]).toMatchObject({ method: 'PUT', path: '/api/store/speak-sessions/a' })
  })

  it('getSpeakProgress totals completed sessions only', async () => {
    await saveSpeakSession(db, session('a', '2026-09-20T10:00:00Z'))
    await saveSpeakSession(db, session('b', '2026-09-21T10:00:00Z', 'abandoned'))

    const progress = await getSpeakProgress(db)

    expect(progress).toMatchObject({ totalSessions: 1, totalMinutes: 2, totalTurns: 1, lastSessionDate: '2026-09-20T10:00:00Z' })
  })
})
