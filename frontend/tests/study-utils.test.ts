import { describe, expect, it } from 'vitest'
import { buildSessionQuestions, isClozeExercise, isPronExercise, isTranslationSentence, toFallbackType } from '@/lib/study-utils'

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
  return { text: `词${n}的句子`, romanization: `cí${n} de jùzi`, english: `sentence for word ${n}` }
}

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
    expect(isTranslationSentence({ text: '我学习', romanization: 'wǒ xuéxí', english: 'I study' })).toBe(true)
  })

  it('accepts empty romanization (not all languages have it)', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: '', english: 'I study' })).toBe(true)
  })

  it('rejects when text is empty', () => {
    expect(isTranslationSentence({ text: '', romanization: 'wǒ', english: 'I study' })).toBe(false)
  })

  it('rejects when english is empty', () => {
    expect(isTranslationSentence({ text: '我学习', romanization: 'wǒ', english: '' })).toBe(false)
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
