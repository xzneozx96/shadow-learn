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

export type TipTranscriptStatus = 'pending' | 'ready' | 'unavailable' | 'error' | 'too_long'

export type TipTranscriptSource = 'subtitle' | 'stt'

export interface TipTranscriptRecord {
  videoId: string
  status: TipTranscriptStatus
  source: TipTranscriptSource | null
  lang: string | null
  segments: TipSegment[]
  fetchedAt: string | null
  errorMessage?: string
  durationSec?: number
  limitSec?: number
}

export interface TipChatRecord {
  // Composite key `${courseId}:${videoId}:${kind}` so quiz chats do not
  // overwrite tutor chats for the same course/video pair.
  key: string
  courseId: string
  videoId: string
  kind: TipChatKind
  messages: UIMessage[]
  updatedAt: string
}

// --- B2 additions ---

export type StudioKind = 'summary' | 'study_guide' | 'cards' | 'mind_map'

export type StudioLocale = 'en' | 'vi'

export interface StudioSummaryData {
  abstract: string
  takeaways: string[]
}

export interface StudioStudyGuideData {
  items: Array<{ question: string, answer: string }>
}

export interface ConceptCard {
  id: string
  front: string
  rule: string
  example: string
  trap: string | null
  state: 'new' | 'known' | 'learning'
  updatedAt: string
}

export interface StudioCardsData {
  cards: ConceptCard[]
}

export interface MindMapNode {
  label: string
  summary: string
  children: MindMapNode[]
}

export interface StudioMindMapData {
  root: MindMapNode
}

// Discriminated union for tip-studio rows
export type TipStudioRecord
  = | { key: string, kind: 'summary', videoId: string, locale: StudioLocale, data: StudioSummaryData, generatedAt: string }
    | { key: string, kind: 'study_guide', videoId: string, locale: StudioLocale, data: StudioStudyGuideData, generatedAt: string }
    | { key: string, kind: 'cards', videoId: string, locale: StudioLocale, data: StudioCardsData, generatedAt: string }
    | { key: string, kind: 'mind_map', videoId: string, locale: StudioLocale, data: StudioMindMapData, generatedAt: string }

export interface TipCardsRecord {
  key: string
  videoId: string
  locale: StudioLocale
  cards: ConceptCard[]
  generatedAt: string
}

// Quiz chat kind discriminator (D1)
export type TipChatKind = 'tutor' | 'quiz'
