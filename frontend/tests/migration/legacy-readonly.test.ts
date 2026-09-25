import { expect, it } from 'vitest'
import * as legacy from '@/db/legacy'

it('legacy.ts exports no IndexedDB write helper', () => {
  const writers = Object.keys(legacy).filter(name => /^(?:save|put|upsert|append|delete)/.test(name))
  expect(writers).toEqual([])
})
