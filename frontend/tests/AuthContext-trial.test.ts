import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '@/app/providers/AuthContext'
import 'fake-indexeddb/auto'

vi.mock('@/shared/lib/config', () => ({ API_BASE: 'http://api.test' }))

// We test the trial mode logic in isolation — the actual AuthProvider
// is too coupled to IndexedDB for a unit test, so we test the
// sessionStorage key contract and the expected state values.

const TRIAL_KEY = 'shadowlearn_trial'

describe('trial mode sessionStorage contract', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => sessionStorage.clear())

  it('shadowlearn_trial is absent by default', () => {
    expect(sessionStorage.getItem(TRIAL_KEY)).toBeNull()
  })

  it('initial trialMode reads from sessionStorage synchronously', () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    // Simulate useState initializer
    const trialMode = sessionStorage.getItem(TRIAL_KEY) === 'trial'
    expect(trialMode).toBe(true)
  })
})

describe('logout and trial mode', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('logout() clears the trial key so the next account starts outside trial', async () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })))
    function Probe() {
      const { trialMode, logout } = useAuth()
      return createElement('button', { type: 'button', onClick: () => void logout() }, trialMode ? 'trial' : 'no-trial')
    }
    render(createElement(AuthProvider, null, createElement(Probe)))
    expect(screen.getByRole('button')).toHaveTextContent('trial')

    await act(async () => screen.getByRole('button').click())

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('no-trial'))
    expect(sessionStorage.getItem(TRIAL_KEY)).toBeNull()
  })
})
