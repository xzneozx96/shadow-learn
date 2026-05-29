import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/shared/lib/config'

interface ResolveResponse {
  status: 'video' | 'playlist'
  video_id: string
  playlist_id?: string
}

// videoId -> internal tip path, or null when the backend says it isn't curated (404).
// Successful + 404 results are cached for the session; transient failures (503 / network)
// delete their entry so a later render retries instead of sticking on the external link.
const cache = new Map<string, Promise<string | null>>()

function resolveTipPath(videoId: string): Promise<string | null> {
  const cached = cache.get(videoId)
  if (cached)
    return cached

  const promise = fetch(`${API_BASE}/api/collection/resolve/${videoId}`)
    .then((res) => {
      if (res.status === 404)
        return null // definitively not curated -> keep external
      if (!res.ok)
        throw new Error(`resolve failed: ${res.status}`) // 503/etc -> transient, retry later
      return res.json() as Promise<ResolveResponse>
    })
    .then((data) => {
      if (!data)
        return null
      return data.status === 'playlist'
        ? `/tips/playlist/${data.playlist_id}?lesson=${videoId}`
        : `/tips/video/${videoId}`
    })
    .catch((err) => {
      cache.delete(videoId)
      throw err
    })

  cache.set(videoId, promise)
  return promise
}

/**
 * A recommended YouTube link in chat. Resolves the video to its internal tip route
 * (curated playlist or standalone) and opens it in a new tab; falls back to the
 * original external YouTube URL while pending or when the video isn't curated.
 */
export function RecommendedVideoLink({ href, videoId, children }: PropsWithChildren<{ href: string, videoId: string }>) {
  const [resolvedHref, setResolvedHref] = useState(href)

  useEffect(() => {
    let active = true
    resolveTipPath(videoId)
      .then((tipPath) => {
        if (active && tipPath)
          setResolvedHref(tipPath)
      })
      .catch(() => { /* keep external href */ })
    return () => { active = false }
  }, [videoId])

  return <a href={resolvedHref} target="_blank" rel="noreferrer">{children}</a>
}
