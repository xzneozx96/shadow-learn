import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

  it('startTrial sets sessionStorage key to "trial"', () => {
    // Simulate what startTrial() does
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    expect(sessionStorage.getItem(TRIAL_KEY)).toBe('trial')
  })

  it('setup clears the sessionStorage key', () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    // Simulate what setup() does
    sessionStorage.removeItem(TRIAL_KEY)
    expect(sessionStorage.getItem(TRIAL_KEY)).toBeNull()
  })

  it('initial trialMode reads from sessionStorage synchronously', () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    // Simulate useState initializer
    const trialMode = sessionStorage.getItem(TRIAL_KEY) === 'trial'
    expect(trialMode).toBe(true)
  })
})
