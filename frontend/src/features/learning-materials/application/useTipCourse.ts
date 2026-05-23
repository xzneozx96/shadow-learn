import type { PlaylistDetail } from '@/features/learning-materials/domain/collection'
import type { TipCourse, TipLesson, TipSource } from '@/features/learning-materials/domain/tips'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/shared/lib/config'

interface State {
  course: TipCourse | null
  lessons: TipLesson[]
  loading: boolean
  // True while the standalone-video branch is fetching YouTube metadata
  // (title/channel/thumbnail) via oEmbed. Playlists ship full metadata
  // from the backend so this stays false there.
  metaLoading: boolean
  error: Error | null
}

interface YouTubeOEmbed {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

function durationToSec(duration: string): number | null {
  if (!duration)
    return null
  const parts = duration.split(':').map(Number)
  if (parts.some(Number.isNaN))
    return null
  if (parts.length === 2)
    return parts[0] * 60 + parts[1]
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

export function useTipCourse(source: TipSource, id: string): State {
  const [state, setState] = useState<State>({ course: null, lessons: [], loading: true, metaLoading: false, error: null })
  const [lastKey, setLastKey] = useState(`${source}:${id}`)
  const key = `${source}:${id}`
  if (lastKey !== key) {
    setLastKey(key)
    setState({ course: null, lessons: [], loading: true, metaLoading: false, error: null })
  }

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function run() {
      try {
        if (source === 'playlist') {
          const res = await fetch(`${API_BASE}/api/playlist/${encodeURIComponent(id)}`, { signal: controller.signal })
          if (!res.ok)
            throw new Error(`playlist ${id} returned ${res.status}`)
          const data = (await res.json()) as PlaylistDetail
          if (cancelled)
            return
          const lessons: TipLesson[] = data.videos.map(v => ({
            videoId: v.video_id,
            title: v.title,
            duration: v.duration,
            thumbnailUrl: null,
            durationSec: durationToSec(v.duration),
          }))
          setState({
            course: {
              id,
              source,
              name: data.name,
              thumbnailUrl: data.thumbnail_url,
              channel: data.channel,
              topic: data.topic,
              videoIds: lessons.map(l => l.videoId),
              fetchedAt: new Date().toISOString(),
            },
            lessons,
            loading: false,
            metaLoading: false,
            error: null,
          })
        }
        else {
          if (cancelled)
            return
          // Mount immediately with a 'Tip' placeholder so the player and
          // pipeline can start before the oEmbed call returns. metaLoading
          // gates the title display so consumers can swap in a skeleton.
          setState({
            course: {
              id,
              source,
              name: 'Tip',
              thumbnailUrl: null,
              channel: null,
              topic: null,
              videoIds: [id],
              fetchedAt: new Date().toISOString(),
            },
            lessons: [{ videoId: id, title: 'Tip', duration: '', thumbnailUrl: null, durationSec: null }],
            loading: false,
            metaLoading: true,
            error: null,
          })

          try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
            const res = await fetch(oembedUrl, { signal: controller.signal })
            if (cancelled)
              return
            if (res.ok) {
              const meta = (await res.json()) as YouTubeOEmbed
              const title = meta.title?.trim() || 'Tip'
              const channel = meta.author_name?.trim() || null
              const thumb = meta.thumbnail_url?.trim() || null
              setState(prev => prev.course && prev.course.id === id
                ? {
                    ...prev,
                    course: { ...prev.course, name: title, channel, thumbnailUrl: thumb },
                    lessons: prev.lessons.map(l => l.videoId === id ? { ...l, title, thumbnailUrl: thumb } : l),
                    metaLoading: false,
                  }
                : prev)
            }
            else {
              // oEmbed failed (private/removed video). Keep 'Tip' fallback.
              setState(prev => ({ ...prev, metaLoading: false }))
            }
          }
          catch (err) {
            if (controller.signal.aborted || cancelled)
              return
            // Network error — keep the 'Tip' fallback rather than nuking the page.
            void err
            setState(prev => ({ ...prev, metaLoading: false }))
          }
        }
      }
      catch (err) {
        if (controller.signal.aborted || cancelled)
          return
        setState({ course: null, lessons: [], loading: false, metaLoading: false, error: err as Error })
      }
    }

    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [source, id])

  return state
}
