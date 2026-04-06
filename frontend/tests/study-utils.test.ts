import type { LanguageCapabilities } from '@/lib/language-caps'
import { describe, expect, it } from 'vitest'
import { buildExerciseResultPayload, buildSessionQuestions, buildStudyPool, distributeExercises, isClozeExercise, isPronExercise, isTranslationSentence, toFallbackType } from '@/lib/study-utils'

function entry(id: string) {
  return {
    id,
    word: `词${id}`,
    romanization: `cí${id}`,
    meaning: `meaning ${id}`,
    usage: `usage ${id}`,
    sourceLessonId: 'lesson-1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: `seg-${id}`,
    sourceSegmentText: `这是词${id}的例句`,
    sourceSegmentTranslation: `Example sentence for word ${id}`,
    sourceLanguage: 'zh-CN' as const,
    createdAt: '2024-01-01T00:00:00Z',
  }
}

const pool = [entry('1'), entry('2'), entry('3')]

function cloze(n: number) {
  return { story: `story ${n}`, blanks: [`词${n}`] }
}
function pron(n: number) {
  return { sentence: `句子${n}`, translation: `sentence ${n}` }
}
function translation(n: number) {
  return { text: `词${n}的句子`, romanization: `cí${n} de jùzi`, translation: `sentence for word ${n}` }
}

describe('buildStudyPool', () => {
  it('sorts entries newest-first for regular study sessions', () => {
    const entries = [
      { ...entry('a'), createdAt: '2024-01-01T00:00:00Z' },
      { ...entry('b'), createdAt: '2024-03-01T00:00:00Z' },
      { ...entry('c'), createdAt: '2024-02-01T00:00:00Z' },
    ]
    const pool = buildStudyPool(entries, false)
    expect(pool.map(e => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns all entries for review sessions without sorting by date', () => {
    const entries = [
      { ...entry('a'), createdAt: '2024-03-01T00:00:00Z' },
      { ...entry('b'), createdAt: '2024-01-01T00:00:00Z' },
      { ...entry('c'), createdAt: '2024-02-01T00:00:00Z' },
    ]
    const pool = buildStudyPool(entries, true)
    expect(pool).toHaveLength(3)
    expect(pool.map(e => e.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('isClozeExercise', () => {
  it('accepts a valid cloze object', () => {
    expect(isClozeExercise({ story: '今天很好', blanks: ['今天'] })).toBe(true)
  })

  it('rejects when story is empty', () => {
    expect(isClozeExercise({ story: '', blanks: ['词'] })).toBe(false)
  })

  it('rejects when blanks array is empty', () => {
    expect(isClozeExercise({ story: '今天很好', blanks: [] })).toBe(false)
  })

  it('rejects when a blank entry is an empty string', () => {
    expect(isClozeExercise({ story: '今天很好', blanks: [''] })).toBe(false)
  })

  it('rejects null, undefined, and non-objects', () => {
    expect(isClozeExercise(null)).toBe(false)
    expect(isClozeExercise(undefined)).toBe(false)
    expect(isClozeExercise('string')).toBe(false)
  })

  it('rejects object missing required fields', () => {
    expect(isClozeExercise({ story: '今天很好' })).toBe(false)
    expect(isClozeExercise({ blanks: ['词'] })).toBe(false)
  })
})

describe('isPronExercise', () => {
  it('accepts a valid pronunciation object', () => {
    expect(isPronExercise({ sentence: '你好', translation: 'Hello' })).toBe(true)
  })

  it('rejects when sentence is empty', () => {
    expect(isPronExercise({ sentence: '', translation: 'Hello' })).toBe(false)
  })

  it('rejects when translation is empty', () => {
    expect(isPronExercise({ sentence: '你好', translation: '' })).toBe(false)
  })

  it('rejects null, undefined, and non-objects', () => {
    expect(isPronExercise(null)).toBe(false)
    expect(isPronExercise(undefined)).toBe(false)
  })

  it('rejects object missing required fields', () => {
    expect(isPronExercise({ sentence: '你好' })).toBe(false)
    expect(isPronExercise({ translation: 'Hello' })).toBe(false)
  })
})

describe('isTranslationSentence', () => {
  it('accepts a valid translation sentence', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: 'wǒ xuéxí', translation: 'I study' })).toBe(true)
  })

  it('accepts empty romanization (not all languages have it)', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: '', translation: 'I study' })).toBe(true)
  })

  it('rejects when text is empty', () => {
    expect(isTranslationSentence({ text: '', romanization: 'wǒ', translation: 'I study' })).toBe(false)
  })

  it('rejects when english is empty', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: 'wǒ', translation: '' })).toBe(false)
  })

  it('rejects null, undefined, and non-objects', () => {
    expect(isTranslationSentence(null)).toBe(false)
    expect(isTranslationSentence(undefined)).toBe(false)
  })

  it('rejects object missing required fields', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: 'wǒ' })).toBe(false)
  })
})

describe('buildSessionQuestions — cloze', () => {
  it('includes cloze question when data is present', () => {
    const qs = buildSessionQuestions(['cloze'], pool, [cloze(1)], [], [])
    expect(qs).toHaveLength(1)
    expect(qs[0].type).toBe('cloze')
    expect(qs[0].clozeData).toEqual(cloze(1))
  })

  it('skips cloze question when AI returned fewer items than requested', () => {
    // 3 cloze slots but only 1 exercise returned — extra slots must be dropped
    const qs = buildSessionQuestions(
      ['cloze', 'cloze', 'cloze'],
      pool,
      [cloze(1)], // only 1, not 3
      [],
      [],
    )
    expect(qs).toHaveLength(1)
    expect(qs[0].clozeData).toEqual(cloze(1))
  })

  it('produces empty queue when AI returned no cloze data at all', () => {
    const qs = buildSessionQuestions(['cloze', 'cloze'], pool, [], [], [])
    expect(qs).toHaveLength(0)
  })
})

describe('buildSessionQuestions — pronunciation', () => {
  it('includes pronunciation question when data is present', () => {
    const qs = buildSessionQuestions(['pronunciation'], pool, [], [pron(1)], [])
    expect(qs).toHaveLength(1)
    expect(qs[0].type).toBe('pronunciation')
    expect(qs[0].pronunciationData).toEqual(pron(1))
  })

  it('skips pronunciation question when AI returned fewer items than requested', () => {
    const qs = buildSessionQuestions(
      ['pronunciation', 'pronunciation', 'pronunciation'],
      pool,
      [],
      [pron(1)], // only 1, not 3
      [],
    )
    expect(qs).toHaveLength(1)
    expect(qs[0].pronunciationData).toEqual(pron(1))
  })

  it('produces empty queue when AI returned no pronunciation data at all', () => {
    const qs = buildSessionQuestions(['pronunciation', 'pronunciation'], pool, [], [], [])
    expect(qs).toHaveLength(0)
  })
})

describe('buildSessionQuestions — translation', () => {
  it('includes translation question when data is present', () => {
    const qs = buildSessionQuestions(['translation'], pool, [], [], [translation(1)], () => 'en-to-zh')
    expect(qs).toHaveLength(1)
    expect(qs[0].type).toBe('translation')
    expect(qs[0].translationData?.sentence).toEqual(translation(1))
    expect(qs[0].translationData?.direction).toBe('en-to-zh')
  })

  it('uses getDirection to assign direction per question', () => {
    const directions: ('en-to-zh' | 'zh-to-en')[] = ['en-to-zh', 'zh-to-en']
    let i = 0
    const qs = buildSessionQuestions(
      ['translation', 'translation'],
      pool,
      [],
      [],
      [translation(1), translation(2)],
      () => directions[i++],
    )
    expect(qs[0].translationData?.direction).toBe('en-to-zh')
    expect(qs[1].translationData?.direction).toBe('zh-to-en')
  })

  it('skips translation question when AI returned fewer items than requested', () => {
    const qs = buildSessionQuestions(
      ['translation', 'translation', 'translation'],
      pool,
      [],
      [],
      [translation(1)], // only 1, not 3
      () => 'en-to-zh',
    )
    expect(qs).toHaveLength(1)
  })
})

describe('buildSessionQuestions — reconstruction', () => {
  it('populates reconstructionTokens for CJK entries', () => {
    const qs = buildSessionQuestions(['reconstruction'], pool, [], [], [])
    expect(qs).toHaveLength(1)
    expect(qs[0].reconstructionTokens).toBeDefined()
    expect(qs[0].reconstructionTokens!.length).toBeGreaterThan(0)
  })
})

describe('buildSessionQuestions — writing', () => {
  it('includes writing question when entry word is all CJK characters', () => {
    const cjkPool = [{ ...pool[0], word: '你好' }]
    const qs = buildSessionQuestions(['writing'], cjkPool, [], [], [])
    expect(qs).toHaveLength(1)
    expect(qs[0].type).toBe('writing')
  })

  it('skips writing question when entry word has no supported CJK characters', () => {
    const latinPool = [{ ...pool[0], word: 'hello' }]
    const qs = buildSessionQuestions(['writing'], latinPool, [], [], [])
    expect(qs).toHaveLength(0)
  })
})

describe('buildSessionQuestions — mixed', () => {
  it('keeps valid questions and drops questions with missing AI data', () => {
    // 2 cloze requested, 1 returned; 1 pronunciation requested, 1 returned; 1 translation, 1 returned
    const types = ['cloze', 'cloze', 'pronunciation', 'translation'] as const
    const qs = buildSessionQuestions(
      [...types],
      pool,
      [cloze(1)], // only 1 of 2 cloze
      [pron(1)], // 1 of 1 pron — ok
      [translation(1)], // 1 of 1 translation — ok
      () => 'en-to-zh',
    )
    expect(qs).toHaveLength(3) // 1 cloze + 1 pron + 1 translation; second cloze dropped
    expect(qs.map(q => q.type)).toEqual(['cloze', 'pronunciation', 'translation'])
  })

  it('always includes non-AI exercise types (dictation, reconstruction, romanization-recall)', () => {
    const qs = buildSessionQuestions(
      ['dictation', 'romanization-recall', 'reconstruction'],
      pool,
      [],
      [],
      [],
    )
    expect(qs).toHaveLength(3)
    expect(qs[0].type).toBe('dictation')
    expect(qs[1].type).toBe('romanization-recall')
    expect(qs[2].type).toBe('reconstruction')
  })
})

// -------------------------------------------------------------------------- //
// distributeExercises
// -------------------------------------------------------------------------- //

function makeCaps(overrides: Partial<LanguageCapabilities>): LanguageCapabilities {
  return {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    hasTranslation: true,
    inputMode: 'standard',
    dictationPlaceholder: '',
    languageName: 'Test',
    azurePronunciationLocale: null,
    ...overrides,
  }
}

describe('distributeExercises', () => {
  it('never includes translation when hasTranslation is false', () => {
    const caps = makeCaps({ hasTranslation: false })
    const types = distributeExercises('mixed', 50, false, false, caps)
    expect(types).not.toContain('translation')
  })

  it('can include translation when hasTranslation is true', () => {
    const caps = makeCaps({ hasTranslation: true, romanizationSystem: 'none' })
    // Request enough to guarantee translation appears (at least as many as available types)
    const types = distributeExercises('mixed', 10, false, false, caps)
    expect(types).toContain('translation')
  })

  it('never includes romanization-recall when romanizationSystem is none', () => {
    const caps = makeCaps({ romanizationSystem: 'none' })
    const types = distributeExercises('mixed', 50, false, false, caps)
    expect(types).not.toContain('romanization-recall')
  })

  it('can include romanization-recall when romanizationSystem is set', () => {
    const caps = makeCaps({ romanizationSystem: 'pinyin' })
    const types = distributeExercises('mixed', 10, false, false, caps)
    expect(types).toContain('romanization-recall')
  })

  it('never includes pronunciation when hasAzure is false', () => {
    const caps = makeCaps({})
    const types = distributeExercises('mixed', 50, false, false, caps)
    expect(types).not.toContain('pronunciation')
  })

  it('can include pronunciation when hasAzure is true', () => {
    const caps = makeCaps({})
    const types = distributeExercises('mixed', 10, true, false, caps)
    expect(types).toContain('pronunciation')
  })

  it('returns exactly count items in non-mixed mode', () => {
    const caps = makeCaps({})
    const types = distributeExercises('dictation', 7, false, false, caps)
    expect(types).toHaveLength(7)
    expect(types.every(t => t === 'dictation')).toBe(true)
  })

  it('returns exactly count items in mixed mode', () => {
    const caps = makeCaps({})
    const types = distributeExercises('mixed', 5, false, false, caps)
    expect(types).toHaveLength(5)
  })
})

describe('toFallbackType', () => {
  it('maps cloze to romanization-recall', () => {
    expect(toFallbackType('cloze')).toBe('romanization-recall')
  })

  it('maps translation to romanization-recall', () => {
    expect(toFallbackType('translation')).toBe('romanization-recall')
  })

  it('maps pronunciation to romanization-recall', () => {
    expect(toFallbackType('pronunciation')).toBe('romanization-recall')
  })

  it('leaves non-AI types unchanged', () => {
    expect(toFallbackType('dictation')).toBe('dictation')
    expect(toFallbackType('romanization-recall')).toBe('romanization-recall')
    expect(toFallbackType('reconstruction')).toBe('reconstruction')
    expect(toFallbackType('writing')).toBe('writing')
  })
})

// -------------------------------------------------------------------------- //
// buildExerciseResultPayload
// -------------------------------------------------------------------------- //

const fullAssessment = {
  overall: { accuracy: 65, fluency: 50, completeness: 35, prosody: 35 },
  words: [
    { word: '我', accuracy: 85, error_type: null, error_detail: null },
    { word: '中文', accuracy: 51, error_type: 'Mispronunciation' as const, error_detail: null },
    { word: '读', accuracy: 26, error_type: 'Mispronunciation' as const, error_detail: null },
  ],
}

describe('buildExerciseResultPayload', () => {
  it('returns base fields for a non-pronunciation exercise', () => {
    const payload = buildExerciseResultPayload('cloze', 80, {})
    expect(payload).toEqual({ type: 'exercise_result', exercise: 'cloze', score: 80, mistakes: [], skipped: false })
    expect(payload).not.toHaveProperty('breakdown')
    expect(payload).not.toHaveProperty('mispronounced_words')
  })

  it('includes breakdown and mispronounced_words when assessment is provided', () => {
    const payload = buildExerciseResultPayload('pronunciation', 65, { assessment: fullAssessment }) as any
    expect(payload.score).toBe(65)
    expect(payload.breakdown).toEqual({ fluency: 50, completeness: 35, prosody: 35 })
    expect(payload.mispronounced_words).toEqual([
      { word: '中文', error: 'Mispronunciation' },
      { word: '读', error: 'Mispronunciation' },
    ])
  })

  it('sets mispronounced_words to [] when all words are correct', () => {
    const cleanAssessment = {
      overall: { accuracy: 95, fluency: 90, completeness: 100, prosody: 88 },
      words: [
        { word: '你好', accuracy: 95, error_type: null, error_detail: null },
      ],
    }
    const payload = buildExerciseResultPayload('pronunciation', 95, { assessment: cleanAssessment }) as any
    expect(payload.mispronounced_words).toEqual([])
  })

  it('omits assessment fields when exercise is skipped', () => {
    const payload = buildExerciseResultPayload('pronunciation', 0, { skipped: true }) as any
    expect(payload.skipped).toBe(true)
    expect(payload).not.toHaveProperty('breakdown')
    expect(payload).not.toHaveProperty('mispronounced_words')
  })

  it('includes vocabId and word when vocabEntry is provided', () => {
    const vocabEntry = { id: 'vocab-abc-123', word: '真' }
    const payload = buildExerciseResultPayload('writing', 100, {}, vocabEntry) as any
    expect(payload.vocabId).toBe('vocab-abc-123')
    expect(payload.word).toBe('真')
  })

  it('omits vocabId and word when vocabEntry is not provided', () => {
    const payload = buildExerciseResultPayload('writing', 100, {}) as any
    expect(payload).not.toHaveProperty('vocabId')
    expect(payload).not.toHaveProperty('word')
  })

  it('includes vocabId and word alongside other base fields (base fields)', () => {
    const vocabEntry = { id: 'vocab-xyz', word: '朋友' }
    const payload = buildExerciseResultPayload('writing', 80, { mistakes: [{ userAnswer: 'x', correctAnswer: '朋', context: '', date: '' }] }, vocabEntry) as any
    expect(payload.type).toBe('exercise_result')
    expect(payload.exercise).toBe('writing')
    expect(payload.score).toBe(80)
    expect(payload.vocabId).toBe('vocab-xyz')
    expect(payload.word).toBe('朋友')
    expect(payload.mistakes).toEqual(['x'])
  })
})
