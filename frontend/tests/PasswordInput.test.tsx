import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordInput } from '@/shared/ui/PasswordInput'

function renderInForm() {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <PasswordInput showLabel="Show password" hideLabel="Hide password" placeholder="Password" autoComplete="current-password" defaultValue="hunter22" />
    </form>,
  )
  return { onSubmit, input: screen.getByPlaceholderText('Password') }
}

describe('passwordInput', () => {
  it('flips between hidden and shown without submitting the form', () => {
    const { onSubmit, input } = renderInForm()
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')

    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    expect(input).toHaveValue('hunter22')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('is reachable from the keyboard and toggles on Enter without submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit, input } = renderInForm()
    await user.tab()
    expect(input).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input).toHaveAttribute('type', 'text')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
