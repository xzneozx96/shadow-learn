import type { VocabEntry } from '@/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CharacterWritingExercise } from '@/components/study/exercises/CharacterWritingExercise'
import { getLanguageCaps } from '@/lib/language-caps'

// Mock HanziWriterCanvas — simulate the canvas without actual hanzi-writer
vi.mock('@/components/study/exercises/HanziWriterCanvas', () => ({
  HanziWriterCanvas: ({ onComplete }: { onComplete: (usedHint: boolean) => void }) => (
    <div data-testid="canvas">
      <button onClick={() => onComplete(false)}>complete-no-hint</button>
      <button onClick={() => onComplete(true)}>complete-with-hint</button>
    </div>
  ),
}))

// Mock hanzi-writer-utils
vi.mock('@/components/study/exercises/hanzi-writer-utils', () => ({
  animateCharacter: vi.fn(),
}))

const entry: VocabEntry = {
  id: '1',
  word: '你好',
  romanization: 'nǐ hǎo',
  meaning: 'hello',
  usage: '',
  sourceLessonId: 'l1',
  sourceLessonTitle: 'Lesson',
  sourceSegmentId: 's1',
  sourceSegmentText: '你好',
  sourceSegmentTranslation: 'hello',
  sourceLanguage: 'zh-CN',
  createdAt: '',
}

const caps = getLanguageCaps('zh-CN')

describe('characterWritingExercise', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows first character and 1/2 progress for a two-char word', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} caps={caps} writingReps={1} />)
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByTestId('canvas')).toBeTruthy()
  })

  it('advances to second character after first completes without hint', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} caps={caps} writingReps={1} />)
    // guided stage → blank stage (click 1), then blank stage → advance to char 2 (click 2)
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('calls onNext(100) when all chars complete without hint', () => {
    const onNext = vi.fn()
    render(<CharacterWritingExercise entry={entry} onNext={onNext} caps={caps} writingReps={1} />)
    // 2 clicks per character (guided + blank), 2 characters = 4 clicks total
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    vi.runAllTimers()
    expect(onNext).toHaveBeenCalledWith(100)
  })

  it('calls onNext(80) when any char used a hint', () => {
    const onNext = vi.fn()
    render(<CharacterWritingExercise entry={entry} onNext={onNext} caps={caps} writingReps={1} />)
    // hint on guided stage of first char, then complete remaining stages
    fireEvent.click(screen.getByText('complete-with-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    fireEvent.click(screen.getByText('complete-no-hint'))
    vi.runAllTimers()
    expect(onNext).toHaveBeenCalledWith(80)
  })

  it('shows meaning and romanization as prompt', () => {
    render(<CharacterWritingExercise entry={entry} onNext={vi.fn()} caps={caps} writingReps={1} />)
    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.getByText('nǐ hǎo')).toBeTruthy()
  })
})
