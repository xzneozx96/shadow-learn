export interface CollectionVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
  view_count: number | null
  channel: string | null
  description: string | null
}

export interface CollectionPlaylist {
  name: string
  playlist_id: string
  videos: CollectionVideo[]
}

export type CollectionResponse = CollectionPlaylist[]
