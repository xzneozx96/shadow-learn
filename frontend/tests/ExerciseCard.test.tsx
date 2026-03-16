import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'

describe('exerciseCard', () => {
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

  it('does not render info button when info prop is absent', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null}>
        <p>body</p>
      </ExerciseCard>,
    )
    expect(screen.queryByRole('button', { name: /about this exercise/i })).not.toBeInTheDocument()
  })

  it('renders info button when info prop is provided', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null} info="Test info text.">
        <p>body</p>
      </ExerciseCard>,
    )
    expect(screen.getByRole('button', { name: /about this exercise/i })).toBeInTheDocument()
  })

  it('opens popover with description text on click', () => {
    render(
      <ExerciseCard type="Dictation" progress="" footer={null} info="Test info text.">
        <p>body</p>
      </ExerciseCard>,
    )
    fireEvent.click(screen.getByRole('button', { name: /about this exercise/i }))
    expect(screen.getByText('Test info text.')).toBeInTheDocument()
  })
})
