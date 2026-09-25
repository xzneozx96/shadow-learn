import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/app/providers/AuthContext'
import { MigrationGate } from '@/features/migration/MigrationGate'
import { reduce } from '@/features/migration/useMigration'
import { legacyFixture, LESSON_A, PIN, seedLegacyDatabase } from '../e2e/support/legacy-seed'
import { fakeImportServer } from './fake-import-server'
import { stubApi } from './stub-api'
import 'fake-indexeddb/auto'
import './nested-blobs'

async function databaseExists(): Promise<boolean> {
  return (await indexedDB.databases()).some(info => info.name === 'shadowlearn')
}

const logout = vi.fn(async () => {})
const openApp = vi.fn()

function signedIn(userId: string, children: ReactNode) {
  const value = {
    session: { userId, email: `${userId}@example.com` },
    sessionCheckFailed: false,
    db: null,
    login: async () => {},
    signup: async () => {},
    logout,
    requestPasswordReset: async () => {},
    resetPassword: async () => {},
  }
  return <AuthContext value={value}>{children}</AuthContext>
}

function renderGate(options: Parameters<typeof legacyFixture>[0] = {}, userId = 'account-a') {
  const server = fakeImportServer()
  const { api } = stubApi(server.handle)
  const view = () => signedIn(userId, <MigrationGate api={api} openApp={openApp}><p>the app</p></MigrationGate>)
  return {
    server,
    seeded: seedLegacyDatabase(legacyFixture(options)).then(() => render(view())),
  }
}

function steps() {
  const list = screen.queryByRole('list', { name: 'Steps' })
  if (!list)
    return null
  const items = [...list.querySelectorAll('li')]
  const label = (item: Element) => item.lastElementChild?.textContent
  return {
    labels: items.map(label),
    current: label(items.find(item => item.getAttribute('aria-current') === 'step')!),
    checked: items.filter(item => item.querySelector('svg')).map(label),
  }
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Move my data' }))
}

describe('migrationGate', { timeout: 30_000 }, () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('renders the app directly when this browser holds no legacy data', async () => {
    const server = fakeImportServer()
    render(signedIn('account-a', <MigrationGate api={stubApi(server.handle).api}><p>the app</p></MigrationGate>))
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
  })

  it('says in plain words when the old data cannot be read, and logs the raw error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('shadowlearn', 99_999)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    const server = fakeImportServer()
    render(signedIn('account-a', <MigrationGate api={stubApi(server.handle).api}><p>the app</p></MigrationGate>))
    const modal = await screen.findByTestId('migration-modal')
    expect(modal).toHaveTextContent('Trình duyệt này có dữ liệu ShadowLearn cũ nhưng không đọc được. Hãy thử lại sau.')
    expect(modal).not.toHaveTextContent(/version|error|\{message\}/i)
    expect(warn).toHaveBeenCalledWith('[migration] could not read the legacy data', expect.anything())
    warn.mockRestore()
  })

  it('renders no close control and ignores Escape', async () => {
    await renderGate().seeded
    const dialog = await screen.findByTestId('migration-modal')
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByTestId('migration-modal')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('shows no steps on the intro, then three steps with the current one marked', async () => {
    const { seeded } = renderGate({ withKeys: true })
    await seeded
    await screen.findByRole('button', { name: 'Move my data' })
    expect(screen.queryAllByRole('list')).toHaveLength(0)
    await start()
    await screen.findByLabelText('Old PIN')
    expect(steps()).toEqual({ labels: ['Copy', 'Check', 'Finish'], current: 'Copy', checked: [] })
    fireEvent.change(screen.getByLabelText('Old PIN'), { target: { value: PIN } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))
    await screen.findByText(/was removed from this browser/, {}, { timeout: 10_000 })
    expect(steps()).toEqual({ labels: ['Copy', 'Check', 'Finish'], current: 'Finish', checked: ['Copy', 'Check', 'Finish'] })
  })

  it('moves everything, verifies it, deletes the local copy, and then shows the app', async () => {
    const { server, seeded } = renderGate({ withKeys: true })
    await seeded
    await start()
    fireEvent.change(await screen.findByLabelText('Old PIN'), { target: { value: PIN } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))

    expect(await screen.findByText('All 26 checks matched. Your data is in your account and was removed from this browser.', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
    expect([...server.keys.keys()].sort()).toEqual(['azure_speech', 'google', 'openrouter'])
    expect(server.keys.get('azure_speech')).toEqual({ value: 'dummy-azure-key-0002', region: 'eastus' })
    expect(server.media.size).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(openApp).toHaveBeenLastCalledWith('/')
  })

  it('keeps the local copy on a mismatch, names the store, and finishes on Retry', async () => {
    const { server, seeded } = renderGate()
    server.state.fault = 'vocabulary'
    await seeded
    await start()

    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(Array.from(failing.querySelectorAll('li'), li => li.textContent)).toEqual(['Saved words'])
    expect(screen.getByText('25 of 26 checks matched.')).toBeInTheDocument()
    expect(steps()).toMatchObject({ current: 'Check', checked: ['Copy'] })
    expect(await databaseExists()).toBe(true)

    server.state.fault = null
    const counts = new Map(Array.from(server.stores, ([name, records]) => [name, records.size]))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/was removed from this browser/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(new Map(Array.from(server.stores, ([name, records]) => [name, records.size]))).toEqual(counts)
    expect(await databaseExists()).toBe(false)
  })

  it('names a group once when several of its stores fail', async () => {
    const { server, seeded } = renderGate()
    server.state.fault = ['spaced-repetition', 'session-logs', 'vocabulary']
    await seeded
    await start()
    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(Array.from(failing.querySelectorAll('li'), li => li.textContent)).toEqual(['Saved words', 'Study progress'])
    expect(screen.getByText('23 of 26 checks matched.')).toBeInTheDocument()
  })

  it('shows an error with Retry when the server is down, and never deletes', async () => {
    const { server, seeded } = renderGate()
    server.state.down = true
    await seeded
    await start()
    expect(await screen.findByText(/Your data is still in this browser/)).toBeInTheDocument()
    expect(screen.getByText('Check your internet connection, then try again. If it keeps happening, try again later.')).toBeInTheDocument()
    expect(screen.getByTestId('migration-modal')).not.toHaveTextContent(/\b50\d\b|failed:/)
    expect(await databaseExists()).toBe(true)

    server.state.down = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/was removed from this browser/, {}, { timeout: 10_000 })).toBeInTheDocument()
  })

  it('says so on a wrong PIN and lets the user skip keys after a confirmation', async () => {
    const { server, seeded } = renderGate({ withKeys: true })
    await seeded
    await start()
    for (const attempt of [1, 2]) {
      fireEvent.change(await screen.findByLabelText('Old PIN'), { target: { value: '0000' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(`(${attempt} wrong so far)`))
    }
    fireEvent.click(screen.getByRole('button', { name: /Skip, I'll add keys in Settings/ }))
    expect(screen.getByText(/removed from this browser with the rest of your earlier data/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip keys' }))
    expect(await screen.findByText(/Your API keys weren't moved/, {}, { timeout: 10_000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(openApp).toHaveBeenLastCalledWith('/settings')
    expect(server.keys.size).toBe(0)
  })
})

describe('migrationGate exits', { timeout: 30_000 }, () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('keeps the database when a lesson with media is set aside, and offers Sign out', async () => {
    const { server, seeded } = renderGate()
    server.state.rejectLesson = LESSON_A
    await seeded
    await start()
    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(failing).toHaveTextContent('Video: "Greetings, renamed"')
    expect(failing.textContent).not.toContain(LESSON_A)
    expect(await databaseExists()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalled()
  })

  it('falls back to a plain label for media of a lesson with no title', async () => {
    const { server, seeded } = renderGate()
    server.state.rejectLesson = LESSON_A
    await seeded
    const { openDB } = await import('idb')
    const db = await openDB('shadowlearn')
    await db.put('lessons', { ...(await db.get('lessons', LESSON_A)), title: '' })
    db.close()
    await start()
    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(Array.from(failing.querySelectorAll('li'), li => li.textContent)).toEqual(['Videos and recordings'])
    expect(failing.textContent).not.toContain(LESSON_A)
  })

  it('lets the user into the app after a failure and keeps the local copy', async () => {
    const { server, seeded } = renderGate()
    server.state.down = true
    await seeded
    await start()
    fireEvent.click(await screen.findByRole('button', { name: 'Not now, keep my data in this browser' }))
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(await databaseExists()).toBe(true)
  })

  it('saves a record the schema rejects for repair and still finishes', async () => {
    const { server, seeded } = renderGate()
    server.state.rejectRecord = `vocab-${LESSON_A.slice(0, 6)}-0`
    await seeded
    await start()
    expect(await screen.findByText(/2 items couldn't be copied as they were, so we saved them separately to fix later \(Saved words, Study progress\)/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
  })

  it('keeps the account version of what changed on both sides, saves this device\'s for repair, and finishes', async () => {
    const { server, seeded } = renderGate()
    server.state.conflicts = new Set(['threads:__global', `lessons:${LESSON_A}`])
    await seeded
    await start()
    expect(await screen.findByText('2 items were changed both here and in your account. We kept your account\'s versions and saved this device\'s versions separately to fix later.', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByText(/couldn't be copied as/)).not.toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
    expect(server.stores.get('threads')!.get('__global')).toEqual(expect.objectContaining({ editedInAccount: true }))
    expect(server.stores.get('lessons')!.get(LESSON_A)).toEqual(expect.objectContaining({ title: 'Edited in the account' }))
    expect([...server.quarantine.keys()].sort()).toEqual([`lessons:${LESSON_A}`, 'threads:__global'])
    expect(server.quarantine.get('threads:__global')).not.toHaveProperty('editedInAccount')
    expect(server.quarantine.get(`lessons:${LESSON_A}`)).toEqual(expect.objectContaining({ id: LESSON_A, segments: expect.any(Array) }))
    for (const error of server.quarantineErrors.values())
      expect(error).toEqual([{ type: 'conflict' }])
  })

  it('saves a device video that differs from the account\'s for repair, leaves the account file, and finishes', async () => {
    const { server, seeded } = renderGate()
    server.state.conflicts = new Set([`lessons:${LESSON_A}`])
    const account = { size: 1, sha256: 'account-video' }
    server.media.set(`${LESSON_A}:video:`, account)
    await seeded
    await start()
    expect(await screen.findByText(/^2 items were changed both here and in your account/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
    expect(server.media.get(`${LESSON_A}:video:`)).toEqual(account)
    expect(server.quarantinedMedia.get(`${LESSON_A}:video:`)).toEqual(expect.objectContaining({ size: 300_000 }))
  })

  it('keeps the local copy when the device video never reached repair storage', async () => {
    const { server, seeded } = renderGate()
    server.state.conflicts = new Set([`lessons:${LESSON_A}`])
    server.state.dropQuarantinedMedia = true
    server.media.set(`${LESSON_A}:video:`, { size: 1, sha256: 'account-video' })
    await seeded
    await start()
    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(failing).toHaveTextContent('Video: "Greetings, renamed"')
    expect(failing.textContent).not.toContain(LESSON_A)
    expect(await databaseExists()).toBe(true)
  })

  it('speaks the language this browser used before, Vietnamese here', async () => {
    await renderGate({ variant: 'B' }).seeded
    expect(await screen.findByText('Chuyển dữ liệu vào tài khoản')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chuyển dữ liệu' })).toBeInTheDocument()
  })

  it('keeps the local copy when the server writes a record without one of its fields', async () => {
    const { server, seeded } = renderGate()
    server.state.dropField = 'meaning'
    await seeded
    await start()
    const failing = await screen.findByRole('list', { name: 'What didn\'t match' }, { timeout: 10_000 })
    expect(Array.from(failing.querySelectorAll('li'), li => li.textContent)).toEqual(['Saved words'])
    expect(await databaseExists()).toBe(true)
  })

  it('keeps a key the account already holds', async () => {
    const { server, seeded } = renderGate({ withKeys: true })
    server.keys.set('openrouter', { value: 'sk-or-account-key' })
    await seeded
    await start()
    fireEvent.change(await screen.findByLabelText('Old PIN'), { target: { value: PIN } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))
    expect(await screen.findByText(/already had a OpenRouter key/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(server.keys.get('openrouter')).toEqual({ value: 'sk-or-account-key' })
  })

  it('imports a write another tab made during the run before it deletes anything', async () => {
    const { server, seeded } = renderGate({ recordings: 0 })
    server.state.onManifest = async () => {
      const { openDB } = await import('idb')
      const db = await openDB('shadowlearn')
      await db.put('vocabulary', { id: 'late-word', word: '晚', sourceLessonId: LESSON_A, createdAt: '2026-06-02T00:00:00.000Z' })
      db.close()
    }
    await seeded
    await start()
    expect(await screen.findByText(/was removed from this browser/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(server.stores.get('vocabulary')!.has('late-word')).toBe(true)
  })

  it('tells a second account that the import belongs to the first, and changes nothing', async () => {
    const first = renderGate()
    await first.seeded
    const { claimImport } = await import('@/features/migration/exportStores')
    const { openLegacy } = await import('@/features/migration/detectLegacyData')
    const db = await openLegacy()
    await claimImport(db, 'account-b')
    db.close()
    await start()
    expect(await screen.findByText(/already being moved to another account/)).toBeInTheDocument()
    expect(screen.queryAllByRole('list')).toHaveLength(0)
    expect(first.server.stores.size).toBe(0)
    expect(await databaseExists()).toBe(true)
  })
})

describe('reduce', () => {
  it('counts progress only within the current step and never past the total', () => {
    const records = reduce({ step: 'explain', busy: false }, { type: 'records', total: 3 })
    expect(reduce(reduce(records, { type: 'sent', count: 2 }), { type: 'sent', count: 5 })).toEqual({ step: 'records', done: 3, total: 3 })
    expect(reduce({ step: 'verify', records: 3, media: 1 }, { type: 'sent', count: 1 })).toEqual({ step: 'verify', records: 3, media: 1 })
  })

  it('ignores PIN events outside the Keys step', () => {
    expect(reduce({ step: 'verify', records: 3, media: 1 }, { type: 'pin-wrong' })).toEqual({ step: 'verify', records: 3, media: 1 })
  })
})
