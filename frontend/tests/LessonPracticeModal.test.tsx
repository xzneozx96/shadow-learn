import type { VocabEntry } from '@/types'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LessonPracticeModal } from '@/components/lesson/LessonPracticeModal'

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (!vars)
        return key
      let s = key
      for (const [k, v] of Object.entries(vars))
        s = s.replace(`{${k}}`, String(v))
      return s
    },
  }),
}))

const onCompleteSpies: Record<string, () => void> = {}

vi.mock('@/components/study-queue/VocabularySkillSession', () => ({
  VocabularySkillSession: ({ onComplete }: { onComplete: () => void }) => {
    onCompleteSpies.vocabulary = onComplete
    return <div data-testid="skill-vocabulary">vocab session</div>
  },
}))
vi.mock('@/components/study-queue/ListeningSkillSession', () => ({
  ListeningSkillSession: ({ onComplete }: { onComplete: () => void }) => {
    onCompleteSpies.listening = onComplete
    return <div data-testid="skill-listening">listening session</div>
  },
}))
vi.mock('@/components/study-queue/ReadingSkillSession', () => ({
  ReadingSkillSession: ({ onComplete }: { onComplete: () => void }) => {
    onCompleteSpies.reading = onComplete
    return <div data-testid="skill-reading">reading session</div>
  },
}))
vi.mock('@/components/study-queue/WritingSkillSession', () => ({
  WritingSkillSession: ({ onComplete }: { onComplete: () => void }) => {
    onCompleteSpies.writing = onComplete
    return <div data-testid="skill-writing">writing session</div>
  },
}))
vi.mock('@/components/study-queue/SpeakingSkillSession', () => ({
  SpeakingSkillSession: ({ onComplete }: { onComplete: () => void }) => {
    onCompleteSpies.speaking = onComplete
    return <div data-testid="skill-speaking">speaking session</div>
  },
}))

function makeEntry(id: string): VocabEntry {
  return {
    id,
    word: '词',
    romanization: 'cí',
    meaning: 'word',
    usage: '',
    sourceLessonId: 'lesson-1',
    sourceLessonTitle: 'Lesson 1',
    sourceSegmentId: 'seg-1',
    sourceSegmentText: '',
    sourceSegmentTranslation: '',
    sourceLanguage: 'zh-CN',
    createdAt: '2026-05-16T12:00:00.000Z',
  }
}

describe('lessonPracticeModal', () => {
  it('renders the active skill (vocabulary by default) with the provided entries', () => {
    render(
      <LessonPracticeModal
        open
        onClose={() => {}}
        entries={[makeEntry('a'), makeEntry('b')]}
        lessonTitle="Lesson 1"
      />,
    )
    expect(screen.getByTestId('skill-vocabulary')).toBeInTheDocument()
  })

  it('switches the active skill when a sidebar button is clicked', () => {
    render(
      <LessonPracticeModal
        open
        onClose={() => {}}
        entries={[makeEntry('a')]}
        lessonTitle="Lesson 1"
      />,
    )
    fireEvent.click(screen.getByTestId('skill-button-listening'))
    expect(screen.getByTestId('skill-listening')).toBeInTheDocument()
  })

  it('auto-advances to the next skill on complete', () => {
    render(
      <LessonPracticeModal
        open
        onClose={() => {}}
        entries={[makeEntry('a')]}
        lessonTitle="Lesson 1"
      />,
    )
    expect(screen.getByTestId('skill-vocabulary')).toBeInTheDocument()
    act(() => { onCompleteSpies.vocabulary() })
    expect(screen.getByTestId('skill-listening')).toBeInTheDocument()
  })

  it('does NOT show the all-done view when skills are merely visited (not completed)', () => {
    // The all-done view requires every skill to be fully completed (status
    // 'done'), not just visited. Skipped/partial skills (status 'alert')
    // keep the modal open so the user can revisit them.
    render(
      <LessonPracticeModal
        open
        onClose={() => {}}
        entries={[makeEntry('a')]}
        lessonTitle="Lesson 1"
      />,
    )
    act(() => { onCompleteSpies.vocabulary() })
    act(() => { onCompleteSpies.listening() })
    act(() => { onCompleteSpies.reading() })
    act(() => { onCompleteSpies.writing() })
    act(() => { onCompleteSpies.speaking() })
    expect(screen.queryByText(/lesson\.workbook\.practiceAllDone$/i)).toBeNull()
  })
})
