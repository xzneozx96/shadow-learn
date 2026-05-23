import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { getVideo } from '@/db/index'

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
    let video: HTMLVideoElement | null = null

    const handleLoadedMetadata = () => {
      if (video) {
        // Seek to 10% through the video, capped at 2s, to avoid a black first frame
        video.currentTime = Math.min(video.duration * 0.1, 2)
      }
    }

    const handleSeeked = () => {
      if (cancelled || !video)
        return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', 0.8)
      cache.set(lessonId, url)
      if (!cancelled)
        setDataUrl(url)
    }

    getVideo(db, lessonId).then((blob) => {
      if (!blob || cancelled)
        return

      objectUrl = URL.createObjectURL(blob)
      video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = objectUrl

      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      video.addEventListener('seeked', handleSeeked, { once: true })
    })

    return () => {
      cancelled = true
      if (objectUrl)
        URL.revokeObjectURL(objectUrl)
      if (video) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('seeked', handleSeeked)
        video.src = ''
        video.load() // Stop any pending video loading
      }
    }
  }, [lessonId, enabled, db])

  return dataUrl
}
