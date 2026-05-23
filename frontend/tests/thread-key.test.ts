import { describe, expect, it } from 'vitest'
import { resolveThreadId } from '@/features/agent/lib/context-assembler/thread-key'

describe('resolveThreadId', () => {
  it('lesson surface returns lessonId', () => {
    expect(resolveThreadId('lesson', { lessonId: 'abc' })).toBe('abc')
  })
  it('global surface returns __global constant', () => {
    expect(resolveThreadId('global', {})).toBe('__global')
  })
  it('tip surface returns courseId:videoId', () => {
    expect(resolveThreadId('tip', { courseId: 'c', videoId: 'v' })).toBe('c:v')
  })
  it('throws when lesson surface missing lessonId', () => {
    expect(() => resolveThreadId('lesson', {})).toThrow()
  })
  it('throws when tip surface missing courseId or videoId', () => {
    expect(() => resolveThreadId('tip', { courseId: 'c' })).toThrow()
  })
})
