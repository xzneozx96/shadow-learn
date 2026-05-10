import type { PlaylistItem } from '@/types/collection'
import { ListVideo } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardPin,
  cutoutCardSurfaceClassName,
  CutoutCorner,
} from '@/components/ui/cutout-card'
import { cn } from '@/lib/utils'

const DIFFICULTY_TONE: Record<string, string> = {
  'HSK 1-2': 'text-emerald-600 dark:text-emerald-400',
  'HSK 3-4': 'text-amber-600 dark:text-amber-400',
  'HSK 5+': 'text-red-600 dark:text-red-400',
}

function difficultyTone(difficulty: string | null): string {
  if (!difficulty)
    return 'text-muted-foreground'
  return DIFFICULTY_TONE[difficulty] ?? 'text-muted-foreground'
}

interface PlaylistCardProps {
  playlist: PlaylistItem
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
  return (
    <Link
      to={`/collection/${playlist.playlist_id}`}
      className="shrink-0 w-[calc(25%-15px)] min-w-[260px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      <CutoutCard className={cn(cutoutCardSurfaceClassName, 'h-full select-none group/card cursor-pointer flex flex-col')}>
        <CutoutCardMedia className="aspect-video">
          {playlist.thumbnail_url
            ? (
                <CutoutCardImage
                  src={playlist.thumbnail_url}
                  alt={playlist.name}
                  className="object-cover w-full h-full transition-transform duration-300 group-hover/card:scale-[1.02]"
                />
              )
            : (
                <div className="absolute inset-0 bg-linear-to-br from-secondary via-muted to-secondary flex items-center justify-center">
                  <ListVideo className="size-10 text-muted-foreground/50" />
                </div>
              )}

          {playlist.video_count !== null && (
            <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-card px-2.5 py-1 text-[11px] font-semibold text-card-foreground tabular-nums shadow-md ring-1 ring-border/40 flex items-center gap-1">
              <ListVideo className="size-3 shrink-0" />
              <span>{playlist.video_count}</span>
              <CutoutCorner className="absolute top-0 -left-[23px] -rotate-90 text-card" size={24} />
              <CutoutCorner className="absolute right-0 -bottom-[23px] -rotate-90 text-card" size={24} />
            </CutoutCardPin>
          )}

          {playlist.difficulty && (
            <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-3 py-1.5">
              <span className={cn('font-bold text-xs uppercase tracking-widest', difficultyTone(playlist.difficulty))}>
                {playlist.difficulty}
              </span>
              <CutoutCorner className="absolute -right-[31px] -bottom-px rotate-90 text-card" />
              <CutoutCorner className="absolute -top-[31px] -left-px rotate-90 text-card" />
            </CutoutCardInsetLabel>
          )}

        </CutoutCardMedia>

        <CutoutCardContent className="p-4 flex items-center justify-between gap-3">
          <p className="flex-1 text-sm font-semibold leading-snug line-clamp-2 text-foreground">
            {playlist.name}
          </p>
          {playlist.topic && (
            <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-secondary text-muted-foreground">
              {playlist.topic}
            </span>
          )}
        </CutoutCardContent>
      </CutoutCard>
    </Link>
  )
}
