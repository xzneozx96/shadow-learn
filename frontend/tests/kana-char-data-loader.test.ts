import { describe, expect, it, vi } from 'vitest'
import { kanaCharDataLoader } from '@/lib/kana-char-data-loader'

describe('kanaCharDataLoader', () => {
  it('calls onLoad with stroke data for a known hiragana character', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()

    kanaCharDataLoader('あ', onLoad, onError)

    expect(onLoad).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    const data = onLoad.mock.calls[0][0]
    expect(Array.isArray(data.strokes)).toBe(true)
    expect(data.strokes.length).toBeGreaterThan(0)
    expect(Array.isArray(data.medians)).toBe(true)
    expect('character' in data).toBe(false) // CharacterJson has no character field
  })

  it('calls onLoad with stroke data for a known katakana character', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()

    kanaCharDataLoader('ア', onLoad, onError)

    expect(onLoad).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError for a character not in the bundle', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()

    kanaCharDataLoader('X', onLoad, onError)

    expect(onError).toHaveBeenCalledOnce()
    expect(onLoad).not.toHaveBeenCalled()
  })
})
