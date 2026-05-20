import { describe, expect, it } from 'vitest'
import { scrub } from '@/contexts/GlobalCompanionContext'

describe('chip scrub', () => {
  it('strips system tags', () => {
    expect(scrub('<system>x</system>hi')).toBe('hi')
  })
  it('strips tool tags', () => {
    expect(scrub('<tool>y</tool>z')).toBe('z')
  })
  it('strips instructions tag variants', () => {
    expect(scrub('<instruction>a</instruction>b')).toBe('b')
    expect(scrub('<instructions>c</instructions>d')).toBe('d')
  })
  it('preserves normal text', () => {
    expect(scrub('plain text')).toBe('plain text')
  })
})
