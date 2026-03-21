import { describe, expect, it, vi } from 'vitest'
import { getSegments } from '@/db'
import {
  executeGetPedagogicalGuidelines,
  executeRenderCharacterWritingExercise,
  executeRenderClozeExercise,
  executeRenderDictationExercise,
  executeRenderPronunciationExercise,
  executeRenderReconstructionExercise,
  executeRenderRomanizationExercise,
  executeRenderTranslationExercise,
} from './agent-tools'

// Mock DB utilities
vi.mock('@/db', () => ({
  getSegments: vi.fn(),
}))

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
    it('returns translation payload on successful fetch', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'vocab-3', word: '你好' } as any)

      const result = await executeRenderTranslationExercise(mockDb, { itemIds: ['vocab-3'] })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-3')
      expect(result).toEqual({
        type: 'translation',
        props: { items: [{ id: 'vocab-3', word: '你好' }], mode: 'review' },
      })
    })
  })

  describe('executeRenderPronunciationExercise', () => {
    it('returns pronunciation payload when segment is found', async () => {
      vi.mocked(getSegments).mockResolvedValueOnce([
        { id: 'seg-1', text: '你好', translations: { en: 'Hello' } },
      ] as any)

      const result = await executeRenderPronunciationExercise(mockDb, { segmentId: 'seg-1' }, 'lesson-1')

      expect(result).toEqual({
        type: 'pronunciation',
        props: {
          sentence: { sentence: '你好', translation: 'Hello' },
        },
      })
    })

    it('returns error if segmentId is not provided', async () => {
      const result = await executeRenderPronunciationExercise(mockDb, { segmentId: '' }, 'lesson-1')
      expect(result).toEqual({ error: 'segmentId is required for pronunciation exercises' })
    })
  })

  describe('executeRenderClozeExercise', () => {
    it('returns cloze payload with static question details preserving prompt story', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'vocab-1', word: '你好' } as any)

      const question = { story: 'Hello {{blank}}', blanks: ['你好'] }
      const result = await executeRenderClozeExercise(mockDb, { question, itemIds: ['vocab-1'] })

      expect(mockDb.get).toHaveBeenCalledWith('vocabulary', 'vocab-1')
      expect(result).toEqual({
        type: 'cloze',
        props: {
          question,
          items: [{ id: 'vocab-1', word: '你好' }],
        },
      })
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

  describe('executeGetPedagogicalGuidelines', () => {
    it('returns content on successful fetch', async () => {
      const mockText = '# Guidelines\nTest Content'
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockText),
      } as any)

      const result = await executeGetPedagogicalGuidelines()

      expect(result).toEqual({ content: mockText })
      expect(globalThis.fetch).toHaveBeenCalledWith('/fluent/pedagogical_guidelines.md')
    })

    it('returns error on failed fetch', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as any)

      const result = await executeGetPedagogicalGuidelines()

      expect(result).toEqual({ error: 'Guidelines load error: Failed to load guidelines: Not Found' })
    })
  })
})
