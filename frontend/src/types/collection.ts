export interface CollectionVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
}

export interface CollectionPlaylist {
  name: string
  icon: string
  playlist_id: string
  videos: CollectionVideo[]
}

export type CollectionResponse = CollectionPlaylist[]
