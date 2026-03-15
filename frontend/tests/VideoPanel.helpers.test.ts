import { describe, expect, it } from 'vitest'
import { getMimeExtension, sanitizeBaseName } from '../src/components/lesson/VideoPanel'

describe('sanitizeBaseName', () => {
  it('replaces spaces with hyphens', () => {
    expect(sanitizeBaseName('My Lesson')).toBe('My-Lesson')
  })

  it('strips characters outside [a-zA-Z0-9._-]', () => {
    expect(sanitizeBaseName('Hello! World#$')).toBe('Hello-World')
  })

  it('retains underscores', () => {
    expect(sanitizeBaseName('my_lesson')).toBe('my_lesson')
  })

  it('trims leading and trailing hyphens', () => {
    expect(sanitizeBaseName('!My Lesson!')).toBe('My-Lesson')
  })

  it('truncates to 100 chars (base name only)', () => {
    const long = 'a'.repeat(150)
    expect(sanitizeBaseName(long)).toHaveLength(100)
  })

  it('falls back to "lesson" for empty result', () => {
    expect(sanitizeBaseName('!!!###')).toBe('lesson')
    expect(sanitizeBaseName('')).toBe('lesson')
  })
})

describe('getMimeExtension', () => {
  it('maps video/mp4 to .mp4', () => {
    expect(getMimeExtension('video/mp4')).toBe('.mp4')
  })

  it('maps video/webm to .webm', () => {
    expect(getMimeExtension('video/webm')).toBe('.webm')
  })

  it('maps video/quicktime to .mov', () => {
    expect(getMimeExtension('video/quicktime')).toBe('.mov')
  })

  it('maps video/x-msvideo to .avi', () => {
    expect(getMimeExtension('video/x-msvideo')).toBe('.avi')
  })

  it('strips codec suffix before lookup', () => {
    expect(getMimeExtension('video/mp4; codecs=avc1')).toBe('.mp4')
  })

  it('falls back to .mp4 for unknown types', () => {
    expect(getMimeExtension('video/unknown')).toBe('.mp4')
    expect(getMimeExtension('')).toBe('.mp4')
  })
})

describe('isAudioOnly condition', () => {
  // Mirror the expression from VideoPanel: source === 'youtube' && (!blob || blob.type.startsWith('audio/'))
  function isAudioOnly(source: string, blob?: Blob): boolean {
    return source === 'youtube' && (!blob || blob.type.startsWith('audio/'))
  }

  it('is true for youtube with no blob', () => {
    expect(isAudioOnly('youtube')).toBe(true)
  })

  it('is true for youtube with an audio blob (old lesson)', () => {
    expect(isAudioOnly('youtube', new Blob([], { type: 'audio/mpeg' }))).toBe(true)
  })

  it('is false for youtube with a video blob (new lesson)', () => {
    expect(isAudioOnly('youtube', new Blob([], { type: 'video/mp4' }))).toBe(false)
  })

  it('is false for upload source regardless of blob', () => {
    expect(isAudioOnly('upload', new Blob([], { type: 'video/mp4' }))).toBe(false)
  })
})
