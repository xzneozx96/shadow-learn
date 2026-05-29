import { describe, expect, it } from 'vitest'
import { extractYouTubeVideoId } from '@/features/lesson/domain/youtube'

describe('extractYouTubeVideoId', () => {
  it('extracts from youtu.be short links', () => {
    expect(extractYouTubeVideoId('https://youtu.be/CajY1Hb8pwY')).toBe('CajY1Hb8pwY')
  })

  it('extracts from watch?v= links', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=CajY1Hb8pwY')).toBe('CajY1Hb8pwY')
  })

  it('extracts from embed links', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/CajY1Hb8pwY')).toBe('CajY1Hb8pwY')
  })

  it('extracts when a timestamp tail is present', () => {
    expect(extractYouTubeVideoId('https://youtu.be/CajY1Hb8pwY?t=30')).toBe('CajY1Hb8pwY')
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=CajY1Hb8pwY&t=30')).toBe('CajY1Hb8pwY')
  })

  it('extracts when query params precede v=', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?list=PLxyz&v=CajY1Hb8pwY')).toBe('CajY1Hb8pwY')
  })

  it('returns null for playlist-only URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/playlist?list=PLzROKCNBas-2jCvb3UBo8uF5wSEOmnyc3')).toBeNull()
  })

  it('returns null for non-YouTube URLs', () => {
    expect(extractYouTubeVideoId('https://example.com/watch?v=CajY1Hb8pwY')).toBeNull()
    expect(extractYouTubeVideoId('not a url')).toBeNull()
  })
})
