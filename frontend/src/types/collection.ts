export interface CollectionVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
  view_count: number | null
  like_count: number | null
  release_date: string | null // ISO YYYY-MM-DD or null
}

export interface CollectionPlaylist {
  name: string
  playlist_id: string
  videos: CollectionVideo[]
}

export type CollectionResponse = CollectionPlaylist[]
