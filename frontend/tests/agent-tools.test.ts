import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  executeGetCoreGuidelines,
  executeGetSkillGuide,
  executeRenderCharacterWritingExercise,
  executeRenderClozeExercise,
  executeRenderDictationExercise,
  executeRenderPronunciationExercise,
  executeRenderReconstructionExercise,
  executeRenderRomanizationExercise,
  executeRenderTranslationExercise,
  ToolInputSchemas,
} from '@/lib/agent-tools'

describe('agent-tools executors', () => {
  const mockDb = {
    get: vi.fn(),
  } as any

  describe('executeRenderDictationExercise', () => {
    it('returns dictation result payload on successful fetch', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'vocab-1', word: '你好' } as any)

      const result = await executeRenderDictationExercise(mockDb, { itemIds: ['vocab-1'] })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-1')
      expect(result).toEqual({
        type: 'dictation',
        props: {
          items: [{ id: 'vocab-1', word: '你好' }],
          mode: 'review',
        },
      })
    })

    it('returns error if vocab id not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await executeRenderDictationExercise(mockDb, { itemIds: ['missing-id'] })

      expect(result).toEqual({ error: 'No items available for dictation.' })
    })
  })

  describe('executeRenderCharacterWritingExercise', () => {
    it('returns character_writing payload on successful fetch', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'vocab-1', word: '你好' } as any)

      const result = await executeRenderCharacterWritingExercise(mockDb, { itemIds: ['vocab-1'] })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-1')
      expect(result).toEqual({
        type: 'writing',
        props: { items: [{ id: 'vocab-1', word: '你好' }], mode: 'review' },
      })
    })

    it('returns error if vocab id not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)
      const result = await executeRenderCharacterWritingExercise(mockDb, { itemIds: ['missing-id'] })
      expect(result).toEqual({ error: 'No items available for character writing.' })
    })
  })

  describe('executeRenderRomanizationExercise', () => {
    it('returns romanization payload on successful fetch', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'vocab-2', word: '你好' } as any)

      const result = await executeRenderRomanizationExercise(mockDb, { itemIds: ['vocab-2'] })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-2')
      expect(result).toEqual({
        type: 'romanization-recall',
        props: { items: [{ id: 'vocab-2', word: '你好' }], mode: 'review' },
      })
    })
  })

  describe('executeRenderTranslationExercise', () => {
    const vocabEntry = { id: 'vocab-3', word: '旅游', romanization: 'lǚyóu', meaning: 'travel', usage: '我喜欢旅游', sourceLanguage: 'zh-CN' }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls /api/translation/generate and returns AI-generated sentence', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      const sentence = { text: '我们计划去旅游', romanization: 'wǒmen jìhuà qù lǚyóu', english: 'We plan to travel' }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sentences: [sentence] }),
      } as any)

      const result = await executeRenderTranslationExercise(mockDb, { itemIds: ['vocab-3'] }, 'test-key') as any

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/translation/generate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"sentence_count":1'),
        }),
      )
      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.word).toBe('旅游')
      expect(body.openrouter_api_key).toBe('test-key')
      expect(result.type).toBe('translation')
      expect(result.props.sentence).toEqual(sentence)
      expect(result.props.items).toEqual([vocabEntry])
      expect(['en-to-zh', 'zh-to-en']).toContain(result.props.direction)
    })

    it('returns error on API failure', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as any)

      const result = await executeRenderTranslationExercise(mockDb, { itemIds: ['vocab-3'] }, 'test-key')

      expect(result).toEqual({ error: 'Translation generation failed (500)' })
    })

    it('returns error when API returns empty sentences', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sentences: [] }),
      } as any)

      const result = await executeRenderTranslationExercise(mockDb, { itemIds: ['vocab-3'] }, 'test-key')

      expect(result).toEqual({ error: 'No sentence generated.' })
    })
  })

  describe('executeRenderPronunciationExercise', () => {
    const vocabEntry = { id: 'vocab-4', word: '学校', romanization: 'xuéxiào', meaning: 'school', usage: '我去学校', sourceLanguage: 'zh-CN' }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls /api/quiz/generate with pronunciation_sentence and returns result', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      const exercise = { sentence: '我每天去学校上课', translation: 'I go to school every day' }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [exercise] }),
      } as any)

      const result = await executeRenderPronunciationExercise(mockDb, { itemIds: ['vocab-4'] }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.exercise_type).toBe('pronunciation_sentence')
      expect(body.count).toBe(1)
      expect(body.words[0].word).toBe('学校')
      expect(result.type).toBe('pronunciation')
      expect(result.props.sentence).toEqual(exercise)
      expect(result.props.items).toEqual([vocabEntry])
    })

    it('returns error on API failure', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 } as any)

      const result = await executeRenderPronunciationExercise(mockDb, { itemIds: ['vocab-4'] }, 'test-key')

      expect(result).toEqual({ error: 'Pronunciation generation failed (503)' })
    })

    it('returns error when API returns empty exercises', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [] }),
      } as any)

      const result = await executeRenderPronunciationExercise(mockDb, { itemIds: ['vocab-4'] }, 'test-key')

      expect(result).toEqual({ error: 'No pronunciation sentence generated.' })
    })
  })

  describe('executeRenderClozeExercise', () => {
    const vocabEntry = { id: 'vocab-5', word: '天气', romanization: 'tiānqì', meaning: 'weather', usage: '今天天气很好', sourceLanguage: 'zh-CN' }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls /api/quiz/generate with cloze and returns result', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      const exercise = { story: '今天{{天气}}很好', blanks: ['天气'] }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [exercise] }),
      } as any)

      const result = await executeRenderClozeExercise(mockDb, { itemIds: ['vocab-5'] }, 'test-key') as any

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
      expect(body.exercise_type).toBe('cloze')
      expect(body.story_count).toBe(1)
      expect(body.words[0].word).toBe('天气')
      expect(result.type).toBe('cloze')
      expect(result.props.question).toEqual(exercise)
      expect(result.props.items).toEqual([vocabEntry])
    })

    it('returns error on API failure', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 422 } as any)

      const result = await executeRenderClozeExercise(mockDb, { itemIds: ['vocab-5'] }, 'test-key')

      expect(result).toEqual({ error: 'Cloze generation failed (422)' })
    })

    it('returns error when API returns empty exercises', async () => {
      mockDb.get.mockResolvedValueOnce(vocabEntry as any)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exercises: [] }),
      } as any)

      const result = await executeRenderClozeExercise(mockDb, { itemIds: ['vocab-5'] }, 'test-key')

      expect(result).toEqual({ error: 'No cloze story generated.' })
    })
  })

  describe('executeRenderReconstructionExercise', () => {
    it('derives words from sourceSegmentText, not from args', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'vocab-1',
        word: '但是',
        sourceSegmentText: '但是我没时间',
        sourceLanguage: 'zh-CN',
      } as any)

      const result = await executeRenderReconstructionExercise(mockDb, { itemId: 'vocab-1' })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-1')
      expect(result).toEqual({
        type: 'reconstruction',
        props: {
          items: [{ id: 'vocab-1', word: '但是', sourceSegmentText: '但是我没时间', sourceLanguage: 'zh-CN' }],
          words: ['但', '是', '我', '没', '时', '间'],
        },
      })
    })

    it('returns error if vocab id not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await executeRenderReconstructionExercise(mockDb, { itemId: 'missing-id' })

      expect(result).toEqual({ error: 'Item not found for reconstruction.' })
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
  it('render_cloze_exercise rejects empty itemIds', () => {
    const result = ToolInputSchemas.render_cloze_exercise.safeParse({ itemIds: [] })
    expect(result.success).toBe(false)
  })

  it('render_cloze_exercise accepts valid input', () => {
    const result = ToolInputSchemas.render_cloze_exercise.safeParse({ itemIds: ['vocab-1'] })
    expect(result.success).toBe(true)
  })

  it('render_reconstruction_exercise rejects missing itemId', () => {
    const result = ToolInputSchemas.render_reconstruction_exercise.safeParse({})
    expect(result.success).toBe(false)
  })

  it('render_translation_exercise accepts optional sourceLanguage', () => {
    const result = ToolInputSchemas.render_translation_exercise.safeParse({
      itemIds: ['vocab-1'],
      sourceLanguage: 'zh-CN',
    })
    expect(result.success).toBe(true)
  })
})

describe('executeRenderClozeExercise — output guard (standalone)', () => {
  const mockDb = {
    get: vi.fn(),
  } as any

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns error when cloze story is missing {{word}} placeholder', async () => {
    mockDb.get.mockResolvedValue({ id: 'vocab-1', word: '你好', romanization: 'nǐ hǎo', meaning: 'hello', usage: '你好！', sourceLanguage: 'zh-CN' } as any)
    // Mock fetch to return a story without {{word}}
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exercises: [{ story: 'A story with no blank.', blanks: ['你好'] }] }),
    } as any)
    const result = await executeRenderClozeExercise(mockDb, { itemIds: ['vocab-1'] }, '')
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('{{word}}')
  })
})
