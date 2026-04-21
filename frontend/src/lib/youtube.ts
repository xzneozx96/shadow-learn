const YT_ID_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

export function getYoutubeThumbnail(url: string | null): string | null {
  if (!url)
    return null
  const match = url.match(YT_ID_RE)
  if (!match)
    return null
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
}
