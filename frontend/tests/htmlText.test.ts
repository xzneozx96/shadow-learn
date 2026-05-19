import { describe, expect, it } from 'vitest'
import { escapeHtml, htmlToPlain } from '@/lib/htmlText'

describe('escapeHtml', () => {
  it('escapes the 5 standard characters', () => {
    expect(escapeHtml(`<a href="x" class='y'>1 & 2</a>`))
      .toBe('&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;1 &amp; 2&lt;/a&gt;')
  })
  it('leaves safe text unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
  })
})

describe('htmlToPlain', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToPlain('<p>hello</p>\n\n<p>  world  </p>')).toBe('hello world')
  })
  it('returns empty string for empty html', () => {
    expect(htmlToPlain('')).toBe('')
  })
})
