import type { TipCourse, TipLesson, TipSource } from '@/types'
import type { PlaylistDetail } from '@/types/collection'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

interface State {
  course: TipCourse | null
  lessons: TipLesson[]
  loading: boolean
  error: Error | null
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
  const [state, setState] = useState<State>({ course: null, lessons: [], loading: true, error: null })
  const [lastKey, setLastKey] = useState(`${source}:${id}`)
  const key = `${source}:${id}`
  if (lastKey !== key) {
    setLastKey(key)
    setState({ course: null, lessons: [], loading: true, error: null })
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
            error: null,
          })
        }
        else {
          if (cancelled)
            return
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
            error: null,
          })
        }
      }
      catch (err) {
        if (controller.signal.aborted || cancelled)
          return
        setState({ course: null, lessons: [], loading: false, error: err as Error })
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
