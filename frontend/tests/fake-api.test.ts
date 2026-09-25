import { describe, expect, it } from 'vitest'
import specsSource from '../../backend/app/userdata/specs.py?raw'
import { STORES } from './fake-api'

interface ServerSpec {
  keyPath?: string[]
  singleton?: string
  indexes: Record<string, string>
}

function serverSpecs(): Record<string, ServerSpec> {
  const body = specsSource.slice(specsSource.indexOf('_SPECS = ('))
  const specs: Record<string, ServerSpec> = {}
  for (const chunk of body.split('StoreSpec(').slice(1)) {
    if (chunk.includes('client_writable=False'))
      continue
    const name = /"([^"]+)"/.exec(chunk)![1]
    const keyPath = /key_path=\(([^)]*)\)/.exec(chunk)?.[1]
    const singleton = /singleton_id="([^"]+)"/.exec(chunk)?.[1]
    const indexes = Object.fromEntries(
      Array.from(chunk.matchAll(/IndexedField\("([^"]+)", "[^"]+", "([^"]+)"/g), m => [m[1], m[2]]),
    )
    specs[name] = {
      ...(keyPath ? { keyPath: Array.from(keyPath.matchAll(/"([^"]+)"/g), m => m[1]) } : {}),
      ...(singleton ? { singleton } : {}),
      indexes,
    }
  }
  return specs
}

describe('fakeApiClient store specs', () => {
  it('match the client-writable stores in backend/app/userdata/specs.py', () => {
    const fake = Object.fromEntries(Object.entries(STORES).map(([name, spec]) => [name, {
      ...(spec.keyPath ? { keyPath: spec.keyPath } : {}),
      ...(spec.singleton ? { singleton: spec.singleton } : {}),
      indexes: Object.fromEntries(Object.entries(spec.indexes ?? {}).map(([index, { field }]) => [index, field])),
    }]))
    expect(fake).toEqual(serverSpecs())
  })
})
