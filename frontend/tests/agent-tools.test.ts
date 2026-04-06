import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeGetStudyContext } from '@/lib/tools/data/getStudyContext'
import { executeGetCoreGuidelines } from '@/lib/tools/guidance/getCoreGuidelines'
import { executeGetSkillGuide } from '@/lib/tools/guidance/getSkillGuide'
import { executeGetUserManual } from '@/lib/tools/guidance/getUserManual'
import { getActiveToolPool, getToolDefinitions } from '@/lib/tools/index'
import { executeRenderStudySession, makeRenderStudySessionTool } from '@/lib/tools/render/renderStudySession'

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return {
    ...actual,
    getDueItems: vi.fn().mockResolvedValue([]),
    getRecentMistakes: vi.fn().mockResolvedValue([]),
    getMasteryData: vi.fn().mockResolvedValue(null),
    getProgressStats: vi.fn().mockResolvedValue(null),
    getVocabEntriesByLesson: vi.fn().mockResolvedValue([]),
  }
})

describe('agent-tools executors', () => {
  const mockDb = {
    get: vi.fn(),
  } as any

  beforeEach(() => {
    mockDb.get.mockReset()
  })

  describe('executeRenderStudySession', () => {
    const writingEntry1 = { id: 'vocab-w1', word: '写', sourceLanguage: 'zh-CN' }
    const writingEntry2 = { id: 'vocab-w2', word: '学', sourceLanguage: 'zh-CN' }
    const translationEntry1 = { id: 'vocab-t1', word: '旅游', romanization: 'lǚyóu', meaning: 'travel', usage: '我喜欢旅游', sourceLanguage: 'zh-CN' }
    const translationEntry2 = { id: 'vocab-t2', word: '出发', romanization: 'chūfā', meaning: 'depart', usage: '我们出发吧', sourceLanguage: 'zh-CN' }
    const pronEntry1 = { id: 'vocab-p1', word: '学校', romanization: 'xuéxiào', meaning: 'school', usage: '我去学校', sourceLanguage: 'zh-CN' }
    const pronEntry2 = { id: 'vocab-p2', word: '老师', romanization: 'lǎoshī', meaning: 'teacher', usage: '老师很好', sourceLanguage: 'zh-CN' }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns study_session with questions for writing type (no API calls)', async () => {
      mockDb.get
        .mockResolvedValueOnce(writingEntry1 as any)
        .mockResolvedValueOnce(writingEntry2 as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-w1', 'vocab-w2'],
        exerciseTypes: ['writing'],
      }, 'test-key') as any

      expect(result.type).toBe('study_session')
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].type).toBe('writing')
      expect(result.props.questions[0].entry).toEqual(writingEntry1)
      expect(result.props.questions[1].type).toBe('writing')
      expect(result.props.questions[1].entry).toEqual(writingEntry2)
    })

    it('calls translation API once per entry for translation type', async () => {
      mockDb.get
        .mockResolvedValueOnce(translationEntry1 as any)
        .mockResolvedValueOnce(translationEntry2 as any)
      const sentence1 = { text: '我们去旅游', romanization: 'wǒmen qù lǚyóu', translation: 'We go travelling' }
      const sentence2 = { text: '我们出发了', romanization: 'wǒmen chūfā le', translation: 'We departed' }
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sentences: [sentence1] }) } as any)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sentences: [sentence2] }) } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-t1', 'vocab-t2'],
        exerciseTypes: ['translation'],
      }, 'test-key') as any

      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      expect(result.type).toBe('study_session')
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].type).toBe('translation')
      expect(result.props.questions[0].translationData.sentence).toEqual(sentence1)
      expect(result.props.questions[1].type).toBe('translation')
      expect(result.props.questions[1].translationData.sentence).toEqual(sentence2)
    })

    it('calls pronunciation API once per entry for pronunciation type', async () => {
      mockDb.get
        .mockResolvedValueOnce(pronEntry1 as any)
        .mockResolvedValueOnce(pronEntry2 as any)
      const ex1 = { sentence: '我每天去学校', translation: 'I go to school every day' }
      const ex2 = { sentence: '老师教我们', translation: 'The teacher teaches us' }
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: [ex1] }) } as any)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: [ex2] }) } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-p1', 'vocab-p2'],
        exerciseTypes: ['pronunciation'],
      }, 'test-key') as any

      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      expect(result.type).toBe('study_session')
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].type).toBe('pronunciation')
      expect(result.props.questions[0].pronunciationData.sentence).toBe(ex1.sentence)
      expect(result.props.questions[1].pronunciationData.sentence).toBe(ex2.sentence)
    })

    it('passes sentencesPerWord to translation API and returns one question per sentence', async () => {
      mockDb.get
        .mockResolvedValueOnce(translationEntry1 as any)
      const s1 = { text: '我们去旅游', romanization: 'wǒmen qù lǚyóu', translation: 'We go travelling' }
      const s2 = { text: '旅游很好玩', romanization: 'lǚyóu hěn hǎowán', translation: 'Travelling is fun' }
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sentences: [s1, s2] }) } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-t1'],
        exerciseTypes: ['translation'],
        sentencesPerWord: 2,
      }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.sentence_count).toBe(2)
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].translationData.sentence).toEqual(s1)
      expect(result.props.questions[1].translationData.sentence).toEqual(s2)
    })

    it('passes sentencesPerWord to pronunciation API and returns one question per sentence', async () => {
      mockDb.get
        .mockResolvedValueOnce(pronEntry1 as any)
      const ex1 = { sentence: '我每天去学校', translation: 'I go to school every day' }
      const ex2 = { sentence: '学校很大', translation: 'The school is big' }
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exercises: [ex1, ex2] }) } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-p1'],
        exerciseTypes: ['pronunciation'],
        sentencesPerWord: 2,
      }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.count).toBe(2)
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].pronunciationData.sentence).toBe(ex1.sentence)
      expect(result.props.questions[1].pronunciationData.sentence).toBe(ex2.sentence)
    })

    it('returns error when no items found', async () => {
      mockDb.get.mockResolvedValue(undefined)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['missing-1'],
        exerciseTypes: ['writing'],
      }, 'test-key')

      expect(result).toEqual({ error: 'No vocabulary items found.' })
    })
  })

  describe('executeGetCoreGuidelines', () => {
    it('returns content string', async () => {
      const result = await executeGetCoreGuidelines()
      expect(result).toHaveProperty('content')
      expect(typeof result.content).toBe('string')
      expect(result.content.length).toBeGreaterThan(0)
    })

    it('content is markdown, not HTML', async () => {
      const result = await executeGetCoreGuidelines()
      expect(result.content).not.toContain('<!DOCTYPE html>')
      expect(result.content).toContain('#')
    })
  })

  describe('executeGetSkillGuide', () => {
    const VALID_SKILLS = ['tones', 'pronunciation', 'vocabulary', 'grammar', 'listening', 'speaking', 'characters'] as const

    it.each(VALID_SKILLS)('returns content for skill "%s"', async (skill) => {
      const result = await executeGetSkillGuide({ skill })
      expect(result).toHaveProperty('content')
      expect(typeof (result as any).content).toBe('string')
      expect((result as any).content.length).toBeGreaterThan(0)
    })

    it('returns error for unknown skill', async () => {
      const result = await executeGetSkillGuide({ skill: 'invalid-skill' })
      expect(result).toHaveProperty('error')
    })

    it('each skill returns distinct content', async () => {
      const results = await Promise.all(VALID_SKILLS.map(s => executeGetSkillGuide({ skill: s })))
      const contents = results.map(r => (r as any).content)
      const unique = new Set(contents)
      expect(unique.size).toBe(VALID_SKILLS.length)
    })
  })

  describe('executeRenderStudySession — cloze storyCount', () => {
    const clozeEntry1 = { id: 'vocab-c1', word: '练习', romanization: 'liànxí', meaning: 'practice', usage: '多练习', sourceLanguage: 'zh-CN' }
    const clozeEntry2 = { id: 'vocab-c2', word: '时间', romanization: 'shíjiān', meaning: 'time', usage: '没有时间', sourceLanguage: 'zh-CN' }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('defaults to 1 cloze question when storyCount is omitted', async () => {
      mockDb.get
        .mockResolvedValueOnce(clozeEntry1 as any)
        .mockResolvedValueOnce(clozeEntry2 as any)
      const story = { story: '我每天_练习_中文', blanks: ['练习'] }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [story] }),
      } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-c1', 'vocab-c2'],
        exerciseTypes: ['cloze'],
      }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.story_count).toBe(1)
      expect(result.props.questions).toHaveLength(1)
    })

    it('passes storyCount to API and returns one question per story', async () => {
      mockDb.get
        .mockResolvedValueOnce(clozeEntry1 as any)
        .mockResolvedValueOnce(clozeEntry2 as any)
      const story1 = { story: '我每天_练习_中文', blanks: ['练习'] }
      const story2 = { story: '他没有_时间_学习', blanks: ['时间'] }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [story1, story2] }),
      } as any)

      const result = await executeRenderStudySession(mockDb, {
        itemIds: ['vocab-c1', 'vocab-c2'],
        exerciseTypes: ['cloze'],
        storyCount: 2,
      }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.story_count).toBe(2)
      expect(result.props.questions).toHaveLength(2)
      expect(result.props.questions[0].clozeData).toEqual(story1)
      expect(result.props.questions[1].clozeData).toEqual(story2)
    })
  })
})

describe('tool input validation', () => {
  const schema = makeRenderStudySessionTool('').inputSchema

  it('render_study_session rejects invalid exerciseType', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['not-a-real-type'],
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session accepts valid input', () => {
    const result = schema.safeParse({
      itemIds: ['abc', 'def'],
      exerciseTypes: ['dictation', 'writing'],
    })
    expect(result.success).toBe(true)
  })

  it('render_study_session rejects empty itemIds', () => {
    const result = schema.safeParse({
      itemIds: [],
      exerciseTypes: ['dictation'],
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session rejects empty exerciseTypes', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: [],
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session accepts storyCount within range', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['cloze'],
      storyCount: 5,
    })
    expect(result.success).toBe(true)
  })

  it('render_study_session rejects storyCount of 0', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['cloze'],
      storyCount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session rejects storyCount above max', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['cloze'],
      storyCount: 11,
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session accepts sentencesPerWord within range', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['translation'],
      sentencesPerWord: 3,
    })
    expect(result.success).toBe(true)
  })

  it('render_study_session rejects sentencesPerWord of 0', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['translation'],
      sentencesPerWord: 0,
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session rejects sentencesPerWord above max', () => {
    const result = schema.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['translation'],
      sentencesPerWord: 6,
    })
    expect(result.success).toBe(false)
  })
})

describe('getActiveToolPool', () => {
  it('includes all expected non-deferred tools', () => {
    const pool = getActiveToolPool('test-key')
    const names = pool.map(t => t.name)

    expect(names).toContain('recall_memory')
    expect(names).toContain('save_memory')
    expect(names).toContain('get_vocabulary')
    expect(names).toContain('get_study_context')
    expect(names).toContain('navigate_to_segment')
    expect(names).toContain('start_shadowing')
    expect(names).toContain('play_segment_audio')
    expect(names).toContain('log_mistake')
    expect(names).toContain('update_sr_item')
  })

  it('excludes deferred tools by default (render, data, guidance)', () => {
    const pool = getActiveToolPool('test-key')
    const names = pool.map(t => t.name)

    expect(names).not.toContain('render_study_session')
    expect(names).not.toContain('render_progress_chart')
    expect(names).not.toContain('render_vocab_card')
    expect(names).not.toContain('get_progress_summary')
    expect(names).not.toContain('update_learner_profile')
    expect(names).not.toContain('get_core_guidelines')
    expect(names).not.toContain('get_skill_guide')
    expect(names).not.toContain('get_user_manual')
  })

  it('includes deferred tools when includeDeferred=true', () => {
    const pool = getActiveToolPool('test-key', 'en', { includeDeferred: true })
    const names = pool.map(t => t.name)

    expect(names).toContain('render_study_session')
    expect(names).toContain('render_progress_chart')
    expect(names).toContain('render_vocab_card')
    expect(names).toContain('get_progress_summary')
    expect(names).toContain('update_learner_profile')
    expect(names).toContain('get_core_guidelines')
    expect(names).toContain('get_skill_guide')
    expect(names).toContain('get_user_manual')
  })

  it('returns 10 non-deferred tools by default (18 total - 8 deferred)', () => {
    expect(getActiveToolPool('test-key')).toHaveLength(10)
  })
})

describe('executeGetUserManual', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns content on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('# User Manual\n\nWelcome to ShadowLearn.'),
    } as any)

    const result = await executeGetUserManual() as any

    expect(result).toHaveProperty('content')
    expect(result.content).toContain('User Manual')
    expect(globalThis.fetch).toHaveBeenCalledWith('/docs/USER_MANUAL.txt')
  })

  it('returns error when fetch fails (non-ok response)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false } as any)

    const result = await executeGetUserManual() as any

    expect(result).toHaveProperty('error')
  })

  it('returns error when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network error'))

    const result = await executeGetUserManual() as any

    expect(result).toHaveProperty('error')
  })
})

describe('executeGetStudyContext', () => {
  const mockDb = {
    getAllKeys: vi.fn(),
    get: vi.fn(),
  } as any

  beforeEach(() => {
    mockDb.getAllKeys.mockResolvedValue([])
    mockDb.get.mockResolvedValue(undefined)
    vi.clearAllMocks()
    mockDb.getAllKeys.mockResolvedValue([])
    mockDb.get.mockResolvedValue(undefined)
  })

  it('works without lessonId and skips getVocabEntriesByLesson', async () => {
    const { getVocabEntriesByLesson } = await import('@/db')
    const result = await executeGetStudyContext(mockDb, {}) as any

    expect(result).toHaveProperty('dueItems')
    expect(result).toHaveProperty('recentMistakes')
    expect(result.lessonVocabCount).toBe(0)
    expect(getVocabEntriesByLesson).not.toHaveBeenCalled()
  })

  it('calls getVocabEntriesByLesson when lessonId is provided', async () => {
    const { getVocabEntriesByLesson } = await import('@/db')
    await executeGetStudyContext(mockDb, { lessonId: 'lesson-123' })

    expect(getVocabEntriesByLesson).toHaveBeenCalledWith(mockDb, 'lesson-123')
  })

  it('get_study_context tool definition does not require lessonId', () => {
    const pool = getActiveToolPool('test-key')
    const tools = getToolDefinitions(pool)
    const def = tools.find((t: any) => t.function.name === 'get_study_context') as any
    expect(def).toBeDefined()
    expect(def.function.parameters.required).toBeUndefined()
  })
})
