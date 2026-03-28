import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Setup } from '@/components/onboarding/Setup'

vi.mock('@/lib/config', () => ({
  getAppConfig: vi.fn().mockResolvedValue({
    ttsProvider: 'other',
    sttProvider: 'other',
    freeTrialAvailable: false,
  }),
  API_BASE: '',
}))

const mockSetup = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ setup: mockSetup, startTrial: vi.fn() }),
}))

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return {
    useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }),
  }
})

async function fillPin() {
  await userEvent.type(screen.getByPlaceholderText('Enter a PIN'), '1234')
  await userEvent.type(screen.getByPlaceholderText('Re-enter your PIN'), '1234')
}

it('enables submit without OpenRouter key when PIN is valid', async () => {
  render(<Setup />)
  // Wait for getAppConfig to resolve so provider is no longer null
  await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument())
  await fillPin()
  expect(screen.getByRole('button', { name: /get started/i })).not.toBeDisabled()
})

it('calls setup with undefined openrouterApiKey when left blank', async () => {
  mockSetup.mockResolvedValue(undefined)
  render(<Setup />)
  await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument())
  await fillPin()
  await userEvent.click(screen.getByRole('button', { name: /get started/i }))
  await waitFor(() =>
    expect(mockSetup).toHaveBeenCalledWith(
      expect.objectContaining({ openrouterApiKey: undefined }),
      '1234',
    ),
  )
})
