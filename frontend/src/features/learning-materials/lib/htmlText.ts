const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
}

const ESCAPE_REGEX = /[&<>"']/g
const TAG_REGEX = /<[^>]+>/g
const WHITESPACE_REGEX = /\s+/g

export function escapeHtml(s: string): string {
  return s.replace(ESCAPE_REGEX, c => ESCAPE_MAP[c]!)
}

export function htmlToPlain(html: string): string {
  return html.replace(TAG_REGEX, ' ').replace(WHITESPACE_REGEX, ' ').trim()
}
