import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'

describe('ExerciseCard', () => {
  it('renders type label and progress in header', () => {
    render(
      <ExerciseCard type="Pinyin Recall" progress="3 / 10" footer={<span>footer</span>}>
        <span>body</span>
      </ExerciseCard>,
    )
    expect(screen.getByText('Pinyin Recall')).toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('renders body children', () => {
    render(
      <ExerciseCard type="Dictation" progress="1 / 10" footer={null}>
        <span data-testid="body-content">hello</span>
      </ExerciseCard>,
    )
    expect(screen.getByTestId('body-content')).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(
      <ExerciseCard type="Cloze" progress="2 / 10" footer={<button>Check</button>}>
        <span>body</span>
      </ExerciseCard>,
    )
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument()
  })
})
