import { describe, expect, it } from 'vitest'
import { blobDigest, canonical, storeDigest, toJson } from '@/features/migration/canonical'

describe('canonical', () => {
  it('orders integer-like keys as strings, which object iteration does not', () => {
    expect(canonical(toJson({ 10: 'a', 9: 'b', a: 1 }))).toBe('{"10":"a","9":"b","a":1}')
  })

  it('sorts keys by UTF-16 code units and writes numbers as JSON.stringify does', () => {
    expect(canonical(toJson({ '😀': 1, 'é': 2, 'z': [1.0, -0, 1e21, 0.1 + 0.2] })))
      .toBe('{"z":[1,0,1e+21,0.30000000000000004],"é":2,"😀":1}')
  })

  it('drops what JSONB cannot hold', () => {
    expect(toJson({ text: 'a\0b\uD800c', gone: undefined, when: new Date(0) }))
      .toEqual({ text: 'ab�c', when: '1970-01-01T00:00:00.000Z' })
  })
})

describe('storeDigest', () => {
  it('orders records by the UTF-8 bytes of their id, not by UTF-16', async () => {
    const forward = await storeDigest([['￿', 1], ['😀', 2]])
    const reverse = await storeDigest([['😀', 2], ['￿', 1]])
    expect(forward).toEqual(reverse)
    const expected = await storeDigest([])
    expect(expected.count).toBe(0)
    expect(expected.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('blobDigest', () => {
  it('streams the SHA-256 of a blob', async () => {
    expect(await blobDigest(new Blob(['abc']))).toEqual({
      size: 3,
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })
  })
})
