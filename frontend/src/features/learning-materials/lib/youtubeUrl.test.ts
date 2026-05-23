import { describe, expect, it } from 'vitest'
import { parseYouTubeUrl } from '@/features/learning-materials/lib/youtubeUrl'

describe('parseYouTubeUrl', () => {
  it('parses playlist URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabc1234567'))
      .toEqual({ kind: 'playlist', id: 'PLabc1234567' })
  })

  it('parses watch URL with list= as playlist (preferred over video)', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=VID1&list=PLxyz12345678'))
      .toEqual({ kind: 'playlist', id: 'PLxyz12345678' })
  })

  it('parses watch URL without list= as video', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses youtu.be short URL as video', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses youtu.be with query params', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('returns null for non-youtube URL', () => {
    expect(parseYouTubeUrl('https://vimeo.com/123')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseYouTubeUrl('')).toBeNull()
    expect(parseYouTubeUrl('   ')).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(parseYouTubeUrl('not a url')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(parseYouTubeUrl('  https://youtu.be/abcdefghijk  '))
      .toEqual({ kind: 'video', id: 'abcdefghijk' })
  })

  it('returns null for watch URL with too-short v= param', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull()
  })
})
