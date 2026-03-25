import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { posthog } from '@/lib/posthog'

vi.mock('@/lib/posthog', () => ({
  posthog: {
    captureException: vi.fn(),
    capture: vi.fn(),
  },
}))

function BrokenChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow)
    throw new Error('Test render error')
  return <div>Working fine</div>
}

describe('errorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.mocked(posthog.captureException).mockClear()
  })

  it('renders children normally when no error', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Working fine')).toBeTruthy()
  })

  it('calls posthog.captureException on render error', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(posthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ componentStack: expect.any(String) }) }),
    )
  })

  it('shows fallback UI after crash', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})
