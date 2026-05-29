const YT_ID_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/

export function getYoutubeThumbnail(url: string | null): string | null {
  if (!url)
    return null
  const match = url.match(YT_ID_RE)
  if (!match)
    return null
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
}

/**
 * Extract the 11-char video id from a YouTube watch/youtu.be/embed URL.
 * Returns null for playlist-only URLs (no `v=`) and non-YouTube URLs.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YT_ID_RE)
  return match ? match[1] : null
}
