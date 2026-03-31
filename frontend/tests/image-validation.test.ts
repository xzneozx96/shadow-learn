import { describe, expect, it } from 'vitest'
import { validateImageFile } from '@/lib/image-utils'

const MB = 1024 * 1024

function makeFile(name: string, type: string, size: number): File {
  const buf = new ArrayBuffer(size)
  return new File([buf], name, { type })
}

describe('validateImageFile', () => {
  it('accepts a valid JPEG under 5 MB', () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1 * MB)
    expect(validateImageFile(file)).toBeNull()
  })

  it('accepts a valid PNG under 5 MB', () => {
    const file = makeFile('image.png', 'image/png', 2 * MB)
    expect(validateImageFile(file)).toBeNull()
  })

  it('accepts a valid WEBP under 5 MB', () => {
    const file = makeFile('img.webp', 'image/webp', 500 * 1024)
    expect(validateImageFile(file)).toBeNull()
  })

  it('rejects a GIF with unsupported_type', () => {
    const file = makeFile('anim.gif', 'image/gif', 1 * MB)
    expect(validateImageFile(file)).toBe('unsupported_type')
  })

  it('rejects a PDF with unsupported_type', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1 * MB)
    expect(validateImageFile(file)).toBe('unsupported_type')
  })

  it('rejects a file that is exactly 5 MB + 1 byte with too_large', () => {
    const file = makeFile('big.png', 'image/png', 5 * MB + 1)
    expect(validateImageFile(file)).toBe('too_large')
  })

  it('accepts a file that is exactly 5 MB', () => {
    const file = makeFile('exact.jpg', 'image/jpeg', 5 * MB)
    expect(validateImageFile(file)).toBeNull()
  })
})
