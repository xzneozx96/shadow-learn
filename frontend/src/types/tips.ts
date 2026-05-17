import type { UIMessage } from '@ai-sdk/react'

export interface TipSegment {
  start: number
  end: number
  text: string
}

export type TipSource = 'playlist' | 'video'

export interface TipCourse {
  // For source='playlist', id = YouTube playlist id.
  // For source='video', id = the standalone video id (mini-course-of-1).
  id: string
  source: TipSource
  name: string
  thumbnailUrl: string | null
  channel: string | null
  topic: string | null
  videoIds: string[]
  fetchedAt: string
}

export interface TipLesson {
  videoId: string
  title: string
  duration: string
  thumbnailUrl: string | null
  durationSec: number | null
}

export interface TipProgress {
  // Composite key: `${courseId}:${videoId}` to scope progress per course.
  // A standalone video referenced by multiple discovery paths still uses
  // its own course namespace.
  key: string
  courseId: string
  videoId: string
  watchedSec: number
  totalSec: number
  completed: boolean
  completedAt: string | null
  lastSeenAt: string
}

export type TipTranscriptStatus = 'pending' | 'ready' | 'unavailable' | 'error'

export type TipTranscriptSource = 'subtitle' | 'stt'

export interface TipTranscriptRecord {
  videoId: string
  status: TipTranscriptStatus
  source: TipTranscriptSource | null
  lang: string | null
  segments: TipSegment[]
  fetchedAt: string | null
  errorMessage?: string
}

export interface TipChatRecord {
  // Composite key `${courseId}:${videoId}` so a single video discussed
  // under two course contexts keeps separate threads.
  key: string
  courseId: string
  videoId: string
  messages: UIMessage[]
  updatedAt: string
}
