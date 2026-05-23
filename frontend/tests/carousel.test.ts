import { describe, expect, it } from 'vitest'
import { computeScrollState } from '@/shared/lib/carousel'

describe('computeScrollState', () => {
  describe('no overflow (content fits)', () => {
    it('returns both false when scrollWidth === clientWidth', () => {
      expect(computeScrollState(0, 1000, 1000)).toEqual({
        canScrollPrev: false,
        canScrollNext: false,
      })
    })

    it('returns both false when scrollWidth < clientWidth', () => {
      expect(computeScrollState(0, 1000, 500)).toEqual({
        canScrollPrev: false,
        canScrollNext: false,
      })
    })
  })

  describe('overflow exists', () => {
    it('at left start: prev disabled, next enabled', () => {
      expect(computeScrollState(0, 800, 2000)).toEqual({
        canScrollPrev: false,
        canScrollNext: true,
      })
    })

    it('at right end (regression: right end must disable next, enable prev)', () => {
      const clientWidth = 800
      const scrollWidth = 2000
      const maxScroll = scrollWidth - clientWidth
      expect(computeScrollState(maxScroll, clientWidth, scrollWidth)).toEqual({
        canScrollPrev: true,
        canScrollNext: false,
      })
    })

    it('in the middle: both enabled', () => {
      expect(computeScrollState(500, 800, 2000)).toEqual({
        canScrollPrev: true,
        canScrollNext: true,
      })
    })
  })

  describe('subpixel edge cases', () => {
    it('treats scrollLeft of 0.5 as still at start (prev disabled)', () => {
      expect(computeScrollState(0.5, 800, 2000).canScrollPrev).toBe(false)
    })

    it('treats fractional near-max as at end (next disabled)', () => {
      // maxScroll = 1200; scrollLeft = 1199.7 → ceil = 1200, 1200 < 1199 is false
      expect(computeScrollState(1199.7, 800, 2000).canScrollNext).toBe(false)
    })

    it('1px before max still allows next', () => {
      // maxScroll = 1200; scrollLeft = 1197 → 1197 < 1199 is true
      expect(computeScrollState(1197, 800, 2000).canScrollNext).toBe(true)
    })
  })

  describe('boundary integrity', () => {
    it('never returns canScrollNext=true when scrollLeft is at max', () => {
      const cases = [
        { client: 100, scroll: 100 },
        { client: 500, scroll: 1000 },
        { client: 800, scroll: 2400 },
        { client: 1024, scroll: 5000 },
      ]
      for (const { client, scroll } of cases) {
        const max = Math.max(0, scroll - client)
        const { canScrollNext } = computeScrollState(max, client, scroll)
        expect(canScrollNext, `client=${client} scroll=${scroll}`).toBe(false)
      }
    })

    it('never returns canScrollPrev=true when scrollLeft is 0', () => {
      const cases = [
        { client: 100, scroll: 100 },
        { client: 500, scroll: 1000 },
        { client: 800, scroll: 2400 },
      ]
      for (const { client, scroll } of cases) {
        const { canScrollPrev } = computeScrollState(0, client, scroll)
        expect(canScrollPrev, `client=${client} scroll=${scroll}`).toBe(false)
      }
    })
  })
})
