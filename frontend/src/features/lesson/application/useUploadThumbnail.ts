import type { LessonMedia } from '@/shared/types'
import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { refreshMediaTicket } from '@/db'

// Module-level cache — survives re-renders and card remounts for the session
const cache = new Map<string, string>()

export function clearUploadThumbnails(): void {
  cache.clear()
}

interface UploadThumbnail {
  ref: (element: Element | null) => void
  dataUrl: string | null
}

export function useUploadThumbnail(lessonId: string, media: LessonMedia | undefined, enabled: boolean): UploadThumbnail {
  const { db } = useAuth()
  const [dataUrl, setDataUrl] = useState<string | null>(() => cache.get(lessonId) ?? null)
  const [element, setElement] = useState<Element | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!element || inView)
      return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting))
        setInView(true)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, inView])

  useEffect(() => {
    if (!enabled || !inView || !db || media?.kind !== 'video' || cache.has(lessonId))
      return

    const client = db
    const mediaId = media.id
    let cancelled = false
    let ticketRefreshed = false
    const video = document.createElement('video')

    const handleLoadedMetadata = () => {
      // Seek to 10% through the video, capped at 2s, to avoid a black first frame
      video.currentTime = Math.min(video.duration * 0.1, 2)
    }

    const handleSeeked = () => {
      if (cancelled)
        return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', 0.8)
      cache.set(lessonId, url)
      setDataUrl(url)
    }

    const handleError = () => {
      if (ticketRefreshed)
        return
      ticketRefreshed = true
      refreshMediaTicket(client, mediaId).then((url) => {
        if (!cancelled)
          video.src = url
      }).catch(() => {})
    }

    // Media is served cross-origin; CORS mode keeps the canvas readable.
    video.crossOrigin = 'anonymous'
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError)
    video.src = media.url

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      video.src = ''
      video.load() // Stop any pending video loading
    }
  }, [enabled, inView, db, media, lessonId])

  return { ref: setElement, dataUrl }
}
