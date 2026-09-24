import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '@/app/providers/AuthContext'
import { apiFetch } from '@/shared/lib/api'

vi.mock('@/shared/lib/config', () => ({ API_BASE: 'http://api.test' }))

function Probe() {
  const { session, logout } = useAuth()
  return (
    <div>
      <span data-testid="session">{session === undefined ? 'loading' : session?.email ?? 'signed-out'}</span>
      <button type="button" onClick={() => void logout()}>logout</button>
      <button type="button" onClick={() => void apiFetch('/api/store/vocabulary')}>load</button>
    </div>
  )
}

describe('authContext logout', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('shadowlearn.refresh', 'refresh-1')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('removes the signed-in user\'s pending lessons and keeps other users\'', async () => {
    localStorage.setItem('shadowlearn.pending-lessons.u1', '[{"id":"p1"}]')
    localStorage.setItem('shadowlearn.pending-lessons.u2', '[{"id":"p2"}]')
    fetchMock.mockImplementation(async (input) => {
      if (input === 'http://api.test/api/auth/refresh')
        return new Response(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-2' }), { status: 200 })
      if (input === 'http://api.test/api/users/me')
        return new Response(JSON.stringify({ id: 'u1', email: 'me@example.com' }), { status: 200 })
      return new Response(null, { status: 204 })
    })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('me@example.com'))

    await act(async () => screen.getByRole('button', { name: 'logout' }).click())

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-out'))
    expect(localStorage.getItem('shadowlearn.pending-lessons.u1')).toBeNull()
    expect(localStorage.getItem('shadowlearn.pending-lessons.u2')).toBe('[{"id":"p2"}]')
  })

  it('runs the logout hygiene when the session is lost to a failed refresh', async () => {
    localStorage.setItem('shadowlearn.pending-lessons.u1', '[{"id":"p1"}]')
    fetchMock.mockImplementation(async (input) => {
      if (input === 'http://api.test/api/users/me')
        return new Response(JSON.stringify({ id: 'u1', email: 'me@example.com' }), { status: 200 })
      return new Response(null, { status: 401 })
    })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('me@example.com'))

    await act(async () => screen.getByRole('button', { name: 'load' }).click())

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-out'))
    expect(localStorage.getItem('shadowlearn.pending-lessons.u1')).toBeNull()
    expect(localStorage.getItem('shadowlearn.refresh')).toBeNull()
  })

  it('clears the local session even when the logout call fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === 'http://api.test/api/auth/refresh')
        return new Response(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-2' }), { status: 200 })
      if (input === 'http://api.test/api/users/me')
        return new Response(JSON.stringify({ id: 'u1', email: 'me@example.com' }), { status: 200 })
      if (input === 'http://api.test/api/auth/logout')
        throw new TypeError('Failed to fetch')
      return new Response(null, { status: 401 })
    })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('me@example.com'))

    await act(async () => screen.getByRole('button', { name: 'logout' }).click())

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-out'))
    expect(localStorage.getItem('shadowlearn.refresh')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://api.test/api/auth/logout')).toBe(true)
  })
})
