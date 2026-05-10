export type ContentType = 'material' | 'tip'

export interface HubVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
  view_count: number | null
  channel: string | null
  description: string | null
  topic: string | null
  skill: string | null
  content_type: ContentType
}

export interface MaterialGroup {
  difficulty: string
  videos: HubVideo[]
}

export interface TipGroup {
  skill: string
  videos: HubVideo[]
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
