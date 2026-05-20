export type ParsedYouTubeUrl
  = { kind: 'playlist', id: string }
    | { kind: 'video', id: string }

const VIDEO_ID_RE = /^[\w-]{11}$/
const PLAYLIST_ID_RE = /^[\w-]{10,}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtu.be'])
const WWW_PREFIX_RE = /^www\./

export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl | null {
  const trimmed = raw?.trim()
  if (!trimmed)
    return null

  let url: URL
  try {
    url = new URL(trimmed)
  }
  catch {
    return null
  }

  const host = url.hostname.replace(WWW_PREFIX_RE, '')
  if (!YOUTUBE_HOSTS.has(host))
    return null

  const listParam = url.searchParams.get('list')
  if (listParam && PLAYLIST_ID_RE.test(listParam))
    return { kind: 'playlist', id: listParam }

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1)
    return VIDEO_ID_RE.test(id) ? { kind: 'video', id } : null
  }

  if (url.pathname === '/watch') {
    const v = url.searchParams.get('v')
    if (v && VIDEO_ID_RE.test(v))
      return { kind: 'video', id: v }
  }

  return null
}
