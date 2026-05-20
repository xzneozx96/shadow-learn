import type { HubItem, HubVideo, InstructionLanguage, PlaylistItem } from '@/types/collection'
import { Trash2 } from 'lucide-react'
import { PlaylistCard } from './PlaylistCard'
import { VideoCard } from './VideoCard'

interface Props {
  item: HubItem & { userMaterialId?: string, instructionLanguage?: InstructionLanguage }
  onDelete: (id: string) => void
}

const LANG_BADGE: Record<InstructionLanguage, string> = {
  English: 'EN',
  Vietnamese: 'VI',
  Chinese: 'ZH',
}

export function UserMaterialCard({ item, onDelete }: Props) {
  const id = item.userMaterialId
  const lang = item.instructionLanguage
  return (
    <div className="relative shrink-0 w-[calc(25%-15px)] min-w-[260px]">
      {item.type === 'playlist'
        ? <PlaylistCard playlist={item as PlaylistItem} wrapperClassName="w-full min-w-0" />
        : (
            <VideoCard
              video={item as unknown as HubVideo}
              alreadyCreated={false}
              showCreateLesson={false}
              wrapperClassName="w-full min-w-0"
            />
          )}

      {lang && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-card/95 text-foreground ring-1 ring-border shadow-sm">
          {LANG_BADGE[lang]}
        </span>
      )}

      {id && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(id) }}
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center size-8 rounded-full bg-destructive text-destructive-foreground shadow-md ring-1 ring-destructive/40 hover:bg-destructive/90 hover:scale-105 active:scale-95 transition-all duration-150"
          aria-label="Delete"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}
