import { describe, expect, it } from 'vitest'
import { getChangelog, getLatestAnnouncementId, parseRawEntries } from '@/lib/changelog'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EN_ENTRY = `---
id: 2026-04-workbook-srs
title: Workbook SRS Pronunciation
date: "2026-04-07"
highlights:
  - tag: new
    text: Pronunciation exercises in SRS review mode
  - tag: improved
    text: Scoring and accuracy tracking
video: /changelog/demo.mp4
---

Body text for the changelog page.
`

const VI_ENTRY = `---
id: 2026-04-workbook-srs
title: Phát âm SRS trong Sổ tay
date: "2026-04-07"
highlights:
  - tag: new
    text: Bài tập phát âm trong SRS
  - tag: improved
    text: Theo dõi độ chính xác
video: /changelog/demo.mp4
---

Nội dung tiếng Việt.
`

const OLDER_EN_ENTRY = `---
id: 2026-03-japanese
title: Japanese Support
date: "2026-03-24"
highlights:
  - tag: improved
    text: Japanese language support
---

Japanese body text.
`

// ── parseRawEntries ───────────────────────────────────────────────────────────

describe('parseRawEntries', () => {
  it('parses locale as en from .en.md suffix', () => {
    const entries = parseRawEntries({ '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY })
    expect(entries[0].locale).toBe('en')
  })

  it('parses locale as vi from .vi.md suffix', () => {
    const entries = parseRawEntries({ '../data/changelog/2026-04-07-srs.vi.md': VI_ENTRY })
    expect(entries[0].locale).toBe('vi')
  })

  it('parses all frontmatter fields', () => {
    const [entry] = parseRawEntries({ '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY })
    expect(entry.id).toBe('2026-04-workbook-srs')
    expect(entry.title).toBe('Workbook SRS Pronunciation')
    expect(entry.date).toBe('2026-04-07')
    expect(entry.video).toBe('/changelog/demo.mp4')
  })

  it('parses highlights array with tag and text', () => {
    const [entry] = parseRawEntries({ '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY })
    expect(entry.highlights).toEqual([
      { tag: 'new', text: 'Pronunciation exercises in SRS review mode' },
      { tag: 'improved', text: 'Scoring and accuracy tracking' },
    ])
  })

  it('derives tags as unique ordered set from highlights', () => {
    const [entry] = parseRawEntries({ '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY })
    expect(entry.tags).toEqual(['new', 'improved'])
  })

  it('extracts markdown body text after frontmatter', () => {
    const [entry] = parseRawEntries({ '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY })
    expect(entry.body.trim()).toBe('Body text for the changelog page.')
  })

  it('sorts multiple entries by date descending', () => {
    const entries = parseRawEntries({
      '../data/changelog/2026-04-07-srs.en.md': EN_ENTRY,
      '../data/changelog/2026-03-24-japanese.en.md': OLDER_EN_ENTRY,
    })
    expect(entries[0].date).toBe('2026-04-07')
    expect(entries[1].date).toBe('2026-03-24')
  })

  it('returns empty array for empty input', () => {
    expect(parseRawEntries({})).toEqual([])
  })

  it('handles entry without video field', () => {
    const [entry] = parseRawEntries({ '../data/changelog/2026-03-24-japanese.en.md': OLDER_EN_ENTRY })
    expect(entry.video).toBeUndefined()
  })
})

// ── getChangelog and getLatestAnnouncementId ──────────────────────────────────
// These tests use the actual data files from Task 1.

describe('getChangelog', () => {
  it('returns only entries matching the requested locale', () => {
    const enEntries = getChangelog('en')
    expect(enEntries.length).toBeGreaterThan(0)
    expect(enEntries.every(e => e.locale === 'en')).toBe(true)
  })

  it('returns entries sorted by date descending', () => {
    const entries = getChangelog('en')
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].date >= entries[i].date).toBe(true)
    }
  })

  it('returns vi entries for vi locale', () => {
    const viEntries = getChangelog('vi')
    expect(viEntries.length).toBeGreaterThan(0)
    expect(viEntries.every(e => e.locale === 'vi')).toBe(true)
  })

  it('falls back to en entry when vi file is missing for an id', () => {
    const viEntries = getChangelog('vi')
    const enEntries = getChangelog('en')
    const viIds = new Set(viEntries.map(e => e.id))
    enEntries.forEach(e => expect(viIds.has(e.id)).toBe(true))
  })
})

describe('getLatestAnnouncementId', () => {
  it('returns a non-empty string', () => {
    const id = getLatestAnnouncementId()
    expect(typeof id).toBe('string')
    expect(id!.length).toBeGreaterThan(0)
  })

  it('returns the same id for both locales (locale-agnostic)', () => {
    const id = getLatestAnnouncementId()
    expect(getChangelog('en')[0]?.id).toBe(id)
    expect(getChangelog('vi')[0]?.id).toBe(id)
  })
})
