import type { HubItem, HubVideo, PlaylistItem } from '@/types/collection'
import { Trash2 } from 'lucide-react'
import { PlaylistCard } from './PlaylistCard'
import { VideoCard } from './VideoCard'

interface Props {
  item: HubItem & { userMaterialId?: string }
  onDelete: (id: string) => void
}

export function UserMaterialCard({ item, onDelete }: Props) {
  const id = item.userMaterialId
  return (
    <div className="relative">
      {item.type === 'playlist'
        ? <PlaylistCard playlist={item as PlaylistItem} />
        : <VideoCard video={item as unknown as HubVideo} alreadyCreated={false} showCreateLesson={false} />}
      {id && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(id) }}
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center size-8 rounded-full bg-background/90 border border-border shadow-sm text-muted-foreground hover:text-destructive hover:bg-background transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}
