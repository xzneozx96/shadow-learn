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
    <div className="relative shrink-0 w-[calc(25%-15px)] min-w-[260px] flex flex-col">
      {item.type === 'playlist'
        ? <PlaylistCard playlist={item as PlaylistItem} wrapperClassName="w-full min-w-0 flex-1" />
        : (
            <VideoCard
              video={item as unknown as HubVideo}
              alreadyCreated={false}
              showCreateLesson={false}
              wrapperClassName="w-full min-w-0 flex-1"
            />
          )}

      {id && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(id) }}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center justify-center size-8 rounded-full bg-destructive text-destructive-foreground shadow-md ring-1 ring-destructive/40 hover:bg-destructive/90 hover:scale-105 active:scale-95 transition-all duration-150"
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}
