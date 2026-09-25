import { describe, expect, it } from 'vitest'
import { KEY_PATHS, RECORD_STORES } from '@/features/migration/exportStores'
import { STORE_GROUPS } from '@/features/migration/storeGroups'
import { TRANSLATIONS } from '@/shared/lib/i18n'

describe('store groups', () => {
  const stores = new Set<string>(['lessons', 'segments', ...RECORD_STORES, ...Object.keys(KEY_PATHS)])

  it.each([...stores])('puts %s in a group with an en and vi label', (store) => {
    const group = (STORE_GROUPS as Record<string, string>)[store]
    expect(group, `${store} has no group, so it would render raw`).toBeDefined()
    for (const locale of ['en', 'vi'] as const)
      expect((TRANSLATIONS[locale] as Record<string, string>)[`migration.group.${group}`]).toBeTruthy()
  })
})
