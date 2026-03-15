import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
import type { VocabEntry } from '@/types'

const entry: VocabEntry = {
  id: '1', word: '今天', pinyin: 'jīntiān', meaning: 'today', usage: '',
  sourceLessonId: 'l1', sourceLessonTitle: '', sourceSegmentId: 's1',
  sourceSegmentChinese: '', sourceSegmentTranslation: '', createdAt: '',
}

describe('PinyinRecallExercise', () => {
  it('shows correct feedback on matching pinyin', () => {
    render(<PinyinRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/pinyin/i), { target: { value: 'jin1tian1' } })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))
    expect(screen.getByText(/correct/i)).toBeInTheDocument()
  })

  it('shows wrong feedback on mismatched pinyin', () => {
    render(<PinyinRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/pinyin/i), { target: { value: 'jin2tian1' } })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))
    expect(screen.getByText(/incorrect/i)).toBeInTheDocument()
  })
})
