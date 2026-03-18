import { describe, expect, it } from 'vitest'
import {
  createSpacedRepetitionItem,
  isItemDueToday,
  scoreToQuality,
  updateSpacedRepetition,
} from '@/lib/spacedRepetition'

describe('scoreToQuality', () => {
  it('maps 100 → 5', () => expect(scoreToQuality(100)).toBe(5))
  it('maps 80 → 4', () => expect(scoreToQuality(80)).toBe(4))
  it('maps 60 → 3', () => expect(scoreToQuality(60)).toBe(3))
  it('maps 40 → 2', () => expect(scoreToQuality(40)).toBe(2))
  it('maps 20 → 1', () => expect(scoreToQuality(20)).toBe(1))
  it('maps 0 → 0', () => expect(scoreToQuality(0)).toBe(0))
  it('maps 99 → 4', () => expect(scoreToQuality(99)).toBe(4))
  it('maps 19 → 0', () => expect(scoreToQuality(19)).toBe(0))
})

describe('createSpacedRepetitionItem', () => {
  it('creates default item with correct initial values', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    expect(item.itemId).toBe('vocab-1')
    expect(item.easinessFactor).toBe(2.5)
    expect(item.intervalDays).toBe(1)
    expect(item.repetitions).toBe(0)
    expect(item.masteryLevel).toBe(0)
    expect(item.consecutiveCorrect).toBe(0)
    expect(item.consecutiveIncorrect).toBe(0)
    expect(item.reviewHistory).toEqual([])
  })
})

describe('updateSpacedRepetition', () => {
  it('increments repetitions and sets interval=1 on first correct answer', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    const updated = updateSpacedRepetition(item, 80)
    expect(updated.repetitions).toBe(1)
    expect(updated.intervalDays).toBe(1)
    expect(updated.consecutiveCorrect).toBe(1)
    expect(updated.consecutiveIncorrect).toBe(0)
  })

  it('sets interval=6 on second correct answer', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)
    item = updateSpacedRepetition(item, 80)
    expect(item.repetitions).toBe(2)
    expect(item.intervalDays).toBe(6)
  })

  it('multiplies interval by easiness factor on third+ correct answer', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80) // rep=1, interval=1
    item = updateSpacedRepetition(item, 80) // rep=2, interval=6
    const ef = item.easinessFactor
    item = updateSpacedRepetition(item, 80) // rep=3, interval=round(6*ef)
    expect(item.intervalDays).toBe(Math.round(6 * ef))
  })

  it('resets interval to 1 and repetitions to 0 on incorrect answer (score < 60)', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80) // correct
    item = updateSpacedRepetition(item, 80) // correct
    item = updateSpacedRepetition(item, 20) // incorrect
    expect(item.repetitions).toBe(0)
    expect(item.intervalDays).toBe(1)
    expect(item.consecutiveIncorrect).toBe(1)
    expect(item.consecutiveCorrect).toBe(0)
  })

  it('clamps easiness factor to minimum 1.3', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    // Spam quality=0 (score=0) many times to drive EF down
    for (let i = 0; i < 20; i++) item = updateSpacedRepetition(item, 0)
    expect(item.easinessFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('increments masteryLevel after 5 consecutive correct answers and resets counter', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    for (let i = 0; i < 5; i++) item = updateSpacedRepetition(item, 80)
    expect(item.masteryLevel).toBe(1)
    expect(item.consecutiveCorrect).toBe(0) // counter resets so next level-up requires another 5
  })

  it('decrements masteryLevel after 3 consecutive incorrect answers', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = { ...item, masteryLevel: 3 }
    for (let i = 0; i < 3; i++) item = updateSpacedRepetition(item, 0)
    expect(item.masteryLevel).toBe(2)
  })

  it('does not exceed masteryLevel 5 or go below 0', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = { ...item, masteryLevel: 5, consecutiveCorrect: 4 }
    item = updateSpacedRepetition(item, 100)
    expect(item.masteryLevel).toBe(5)

    item = { ...item, masteryLevel: 0, consecutiveIncorrect: 2 }
    item = updateSpacedRepetition(item, 0)
    expect(item.masteryLevel).toBe(0)
  })

  it('appends to reviewHistory on each update', () => {
    let item = createSpacedRepetitionItem('vocab-1')
    item = updateSpacedRepetition(item, 80)
    item = updateSpacedRepetition(item, 40)
    expect(item.reviewHistory).toHaveLength(2)
    expect(item.reviewHistory[0].quality).toBe(4)
    expect(item.reviewHistory[1].quality).toBe(2)
  })

  it('sets dueDate to today+intervalDays', () => {
    const item = createSpacedRepetitionItem('vocab-1')
    const updated = updateSpacedRepetition(item, 80)
    const expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() + updated.intervalDays)
    expect(updated.dueDate).toBe(expectedDate.toISOString().split('T')[0])
  })
})

describe('isItemDueToday', () => {
  it('returns true when dueDate is today', () => {
    const today = new Date().toISOString().split('T')[0]
    const item = { ...createSpacedRepetitionItem('x'), dueDate: today }
    expect(isItemDueToday(item)).toBe(true)
  })

  it('returns true when dueDate is in the past', () => {
    const item = { ...createSpacedRepetitionItem('x'), dueDate: '2020-01-01' }
    expect(isItemDueToday(item)).toBe(true)
  })

  it('returns false when dueDate is in the future', () => {
    const item = { ...createSpacedRepetitionItem('x'), dueDate: '2099-01-01' }
    expect(isItemDueToday(item)).toBe(false)
  })
})
