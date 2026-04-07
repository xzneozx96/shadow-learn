import type { Locale } from '@/lib/i18n'
import { load } from 'js-yaml'

export type ChangelogTag = 'new' | 'improved' | 'fixed'

export interface ChangelogHighlight {
  tag: ChangelogTag
  text: string
}

export interface ChangelogEntry {
  id: string
  title: string
  date: string // ISO YYYY-MM-DD string
  highlights: ChangelogHighlight[]
  tags: ChangelogTag[] // derived: unique ordered set from highlights[].tag
  video?: string
  body: string // raw markdown body, trimmed
  locale: Locale
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseFrontmatter(raw: string): { data: Record<string, unknown>, content: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match)
    return { data: {}, content: raw }
  return {
    data: (load(match[1]) ?? {}) as Record<string, unknown>,
    content: match[2],
  }
}

/**
 * Parse a Record of { filePath: rawString } into typed ChangelogEntry[].
 * Exported for unit testing — not meant for direct use in components.
 */
export function parseRawEntries(modules: Record<string, string>): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []

  for (const [path, raw] of Object.entries(modules)) {
    const locale: Locale = path.endsWith('.vi.md') ? 'vi' : 'en'
    const { data, content } = parseFrontmatter(raw)

    // gray-matter/js-yaml parses unquoted YYYY-MM-DD as a Date object.
    // Normalise to ISO date string regardless of how it was authored.
    const rawDate = data.date
    const date: string = rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate)

    const highlights: ChangelogHighlight[] = (data.highlights ?? []).map(
      (h: { tag: ChangelogTag, text: string }) => ({ tag: h.tag, text: h.text }),
    )

    const tags: ChangelogTag[] = [...new Set(highlights.map(h => h.tag))]

    entries.push({
      id: String(data.id),
      title: String(data.title),
      date,
      highlights,
      tags,
      video: data.video ? String(data.video) : undefined,
      body: content.trim(),
      locale,
    })
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

// Module-level: load all .md files at build time (and in vitest via Vite transform)
const allEntries = parseRawEntries(
  import.meta.glob('../data/changelog/*.md', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
)

/**
 * Returns entries for the given locale, sorted by date descending.
 * Falls back to 'en' entries for any id with no matching locale file.
 */
export function getChangelog(locale: Locale): ChangelogEntry[] {
  const localeEntries = allEntries.filter(e => e.locale === locale)

  if (locale === 'en')
    return localeEntries

  const localeIds = new Set(localeEntries.map(e => e.id))
  const fallback = allEntries.filter(e => e.locale === 'en' && !localeIds.has(e.id))

  return [...localeEntries, ...fallback].sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Returns the most recent entry id, locale-agnostic.
 * Deduplicates across all locales — robust even if en file is authored after vi.
 */
export function getLatestAnnouncementId(): string | undefined {
  const seen = new Map<string, ChangelogEntry>()
  for (const entry of allEntries) {
    if (!seen.has(entry.id))
      seen.set(entry.id, entry)
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date))[0]?.id
}
