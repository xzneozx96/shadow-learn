import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  executeGetCoreGuidelines,
  executeGetSkillGuide,
  executeRenderStudySession,
  ToolInputSchemas,
} from '@/lib/agent-tools'

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
      const sentence1 = { text: '我们去旅游', romanization: 'wǒmen qù lǚyóu', english: 'We go travelling' }
      const sentence2 = { text: '我们出发了', romanization: 'wǒmen chūfā le', english: 'We departed' }
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
})

describe('toolInputSchemas — input validation', () => {
  it('render_study_session rejects invalid exerciseType', () => {
    const result = ToolInputSchemas.render_study_session.safeParse({
      itemIds: ['abc'],
      exerciseTypes: ['not-a-real-type'],
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session accepts valid input', () => {
    const result = ToolInputSchemas.render_study_session.safeParse({
      itemIds: ['abc', 'def'],
      exerciseTypes: ['dictation', 'writing'],
    })
    expect(result.success).toBe(true)
  })

  it('render_study_session rejects empty itemIds', () => {
    const result = ToolInputSchemas.render_study_session.safeParse({
      itemIds: [],
      exerciseTypes: ['dictation'],
    })
    expect(result.success).toBe(false)
  })

  it('render_study_session rejects empty exerciseTypes', () => {
    const result = ToolInputSchemas.render_study_session.safeParse({
      itemIds: ['abc'],
      exerciseTypes: [],
    })
    expect(result.success).toBe(false)
  })
})
