import type { VocabEntry } from '@/shared/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RomanizationRecallExercise } from '@/features/study/ui/exercises/RomanizationRecallExercise'
import { getLanguageCaps } from '@/shared/lib/language-caps'

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', setLocale: async () => {} }),
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

describe('romanizationRecallExercise', () => {
  it('hides meaning by default', () => {
    render(<RomanizationRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} caps={caps} />)
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('shows meaning after clicking Hint', () => {
    render(<RomanizationRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} caps={caps} />)
    fireEvent.click(screen.getByRole('button', { name: /hint/i }))
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('disables hint button after it is clicked', () => {
    render(<RomanizationRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} caps={caps} />)
    const hintBtn = screen.getByRole('button', { name: /hint/i })
    fireEvent.click(hintBtn)
    expect(hintBtn).toBeDisabled()
  })

  it('shows the word always', () => {
    render(<RomanizationRecallExercise entry={entry} onNext={vi.fn()} playTTS={vi.fn()} caps={caps} />)
    expect(screen.getByText('你好')).toBeTruthy()
  })
})
