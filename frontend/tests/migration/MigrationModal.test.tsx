import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MigrationGate } from '@/features/migration/MigrationModal'
import { reduce } from '@/features/migration/useMigration'
import { legacyFixture, PIN, seedLegacyDatabase } from '../e2e/support/legacy-seed'
import { fakeImportServer } from './fake-import-server'
import { stubApi } from './stub-api'
import 'fake-indexeddb/auto'
import './nested-blobs'

async function databaseExists(): Promise<boolean> {
  return (await indexedDB.databases()).some(info => info.name === 'shadowlearn')
}

function renderGate(options: Parameters<typeof legacyFixture>[0] = {}) {
  const server = fakeImportServer()
  const { api } = stubApi(server.handle)
  return {
    server,
    seeded: seedLegacyDatabase(legacyFixture(options)).then(() => render(<MigrationGate api={api}><p>the app</p></MigrationGate>)),
  }
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
}

describe('migrationGate', { timeout: 30_000 }, () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
  afterEach(() => { globalThis.indexedDB = new IDBFactory() })

  it('renders the app directly when this browser holds no legacy data', async () => {
    const server = fakeImportServer()
    render(<MigrationGate api={stubApi(server.handle).api}><p>the app</p></MigrationGate>)
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
  })

  it('renders no close control and ignores Escape', async () => {
    await renderGate().seeded
    const dialog = await screen.findByTestId('migration-modal')
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByTestId('migration-modal')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('moves everything, verifies it, deletes the local copy, and then shows the app', async () => {
    const { server, seeded } = renderGate({ withKeys: true })
    await seeded
    await start()
    fireEvent.change(await screen.findByLabelText('Old PIN'), { target: { value: PIN } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))

    expect(await screen.findByText('Verified 22 stores and 3 media files. Local copy deleted.', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(await databaseExists()).toBe(false)
    expect([...server.keys.keys()].sort()).toEqual(['azure_speech', 'google', 'openrouter'])
    expect(server.keys.get('azure_speech')).toEqual({ value: 'dummy-azure-key-0002', region: 'eastus' })
    expect(server.media.size).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('the app')).toBeInTheDocument()
  })

  it('keeps the local copy on a mismatch, names the store, and finishes on Retry', async () => {
    const { server, seeded } = renderGate()
    server.state.fault = 'vocabulary'
    await seeded
    await start()

    const failing = await screen.findByRole('list', { name: 'Failing stores' }, { timeout: 10_000 })
    expect(failing).toHaveTextContent('vocabulary')
    expect(failing.querySelectorAll('li')).toHaveLength(1)
    expect(await databaseExists()).toBe(true)

    server.state.fault = null
    const counts = new Map(Array.from(server.stores, ([name, records]) => [name, records.size]))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Local copy deleted/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(new Map(Array.from(server.stores, ([name, records]) => [name, records.size]))).toEqual(counts)
    expect(await databaseExists()).toBe(false)
  })

  it('shows an error with Retry when the server is down, and never deletes', async () => {
    const { server, seeded } = renderGate()
    server.state.down = true
    await seeded
    await start()
    expect(await screen.findByText(/Your data is still in this browser/)).toBeInTheDocument()
    expect(await databaseExists()).toBe(true)

    server.state.down = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Local copy deleted/, {}, { timeout: 10_000 })).toBeInTheDocument()
  })

  it('says so on a wrong PIN and lets the user skip keys after a confirmation', async () => {
    const { server, seeded } = renderGate({ withKeys: true })
    await seeded
    await start()
    for (const attempt of [1, 2]) {
      fireEvent.change(await screen.findByLabelText('Old PIN'), { target: { value: '0000' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unlock keys' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(`(${attempt})`))
    }
    fireEvent.click(screen.getByRole('button', { name: /Skip, re-enter keys in Settings/ }))
    expect(screen.getByText(/deleted with the local copy/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip keys' }))
    expect(await screen.findByText(/Your API keys were not moved/, {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument()
    expect(server.keys.size).toBe(0)
  })
})

describe('reduce', () => {
  it('counts progress only within the current step and never past the total', () => {
    const records = reduce({ step: 'explain' }, { type: 'records', total: 3 })
    expect(reduce(reduce(records, { type: 'sent', count: 2 }), { type: 'sent', count: 5 })).toEqual({ step: 'records', done: 3, total: 3 })
    expect(reduce({ step: 'verify' }, { type: 'sent', count: 1 })).toEqual({ step: 'verify' })
  })

  it('ignores PIN events outside the Keys step', () => {
    expect(reduce({ step: 'verify' }, { type: 'pin-wrong' })).toEqual({ step: 'verify' })
  })
})
