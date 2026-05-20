import { describe, expect, it } from 'vitest'
import { buildTipSystemPrompt } from '../../src/lib/tipChatPrompt'

describe('buildTipSystemPrompt', () => {
  it('returns identical string given identical inputs (cache stability)', () => {
    const a = buildTipSystemPrompt({ lessonTitle: 'Tones', transcript: 'hi', uiLanguage: 'en', mode: 'free' })
    const b = buildTipSystemPrompt({ lessonTitle: 'Tones', transcript: 'hi', uiLanguage: 'en', mode: 'free' })
    expect(a).toBe(b)
  })

  it('includes the Khanmigo hint posture', () => {
    const s = buildTipSystemPrompt({ lessonTitle: 'Tones', transcript: '', uiLanguage: 'en', mode: 'guided' })
    expect(s.toLowerCase()).toContain('hint')
    expect(s.toLowerCase()).not.toContain('give the answer directly')
  })

  it('embeds the transcript verbatim under a clear marker', () => {
    const s = buildTipSystemPrompt({ lessonTitle: 'X', transcript: 'ABC123', uiLanguage: 'en', mode: 'free' })
    expect(s).toContain('<transcript>')
    expect(s).toContain('ABC123')
  })

  it('respects vi UI language', () => {
    const s = buildTipSystemPrompt({ lessonTitle: 'X', transcript: '', uiLanguage: 'vi', mode: 'free' })
    expect(s).toContain('Vietnamese')
  })
})
