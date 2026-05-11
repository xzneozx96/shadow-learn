export type ContentType = 'material' | 'tip'

export interface HubVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
  view_count: number | null
  channel: string | null
  description: string | null
  published_at: string | null
  topic: string | null
  skill: string | null
  content_type: ContentType
}

export interface PlaylistItem {
  type: 'playlist'
  playlist_id: string
  name: string
  thumbnail_url: string | null
  video_count: number | null
  channel: string | null
  published_at: string | null
  difficulty: string | null
  topic: string | null
  skill: string | null
  content_type: ContentType
}

export interface VideoItem extends HubVideo {
  type: 'video'
}

export type HubItem = PlaylistItem | VideoItem

export interface MaterialGroup {
  difficulty: string
  items: HubItem[]
}

export interface TipGroup {
  skill: string
  items: HubItem[]
}

export interface MaterialsSection {
  topics: string[]
  groups: MaterialGroup[]
}

export interface TipsSection {
  groups: TipGroup[]
}

export interface HubResponse {
  materials: MaterialsSection
  tips: TipsSection
}

export interface PlaylistDetail {
  name: string
  thumbnail_url: string | null
  channel: string | null
  published_at: string | null
  topic: string | null
  videos: HubVideo[]
}
