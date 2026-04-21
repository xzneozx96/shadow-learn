import { useEffect, useState } from 'react'
import { getVideo } from '@/db/index'
import { useAuth } from '@/contexts/AuthContext'

// Module-level cache — survives re-renders and card remounts for the session
const cache = new Map<string, string>()

export function useUploadThumbnail(lessonId: string, enabled: boolean): string | null {
  const { db } = useAuth()
  const [dataUrl, setDataUrl] = useState<string | null>(() => cache.get(lessonId) ?? null)

  useEffect(() => {
    if (!enabled || !db || cache.has(lessonId))
      return

    let objectUrl: string | null = null
    let cancelled = false

    getVideo(db, lessonId).then((blob) => {
      if (!blob || cancelled)
        return

      objectUrl = URL.createObjectURL(blob)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = objectUrl

      video.addEventListener('loadedmetadata', () => {
        // Seek to 10% through the video, capped at 2s, to avoid a black first frame
        video.currentTime = Math.min(video.duration * 0.1, 2)
      }, { once: true })

      video.addEventListener('seeked', () => {
        if (cancelled)
          return
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 180
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const url = canvas.toDataURL('image/jpeg', 0.8)
        cache.set(lessonId, url)
        if (!cancelled)
          setDataUrl(url)
      }, { once: true })
    })

    return () => {
      cancelled = true
      if (objectUrl)
        URL.revokeObjectURL(objectUrl)
    }
  }, [lessonId, enabled, db])

  return dataUrl
}
