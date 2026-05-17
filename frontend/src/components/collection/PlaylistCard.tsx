import type { PlaylistItem } from '@/types/collection'
import { Calendar, ListVideo, Tv } from 'lucide-react'
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

function formatPublishedAt(iso: string | null): string | null {
  if (!iso)
    return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return null
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days < 1)
    return 'today'
  if (days < 7)
    return `${days}d ago`
  if (days < 30)
    return `${Math.floor(days / 7)}w ago`
  if (days < 365)
    return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

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
  const target = playlist.content_type === 'tip'
    ? `/tips/playlist/${playlist.playlist_id}`
    : `/collection/${playlist.playlist_id}`

  return (
    <Link
      to={target}
      className="shrink-0 w-[calc(25%-15px)] min-w-[260px] flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      <div className="relative pt-3 flex-1 flex flex-col">
        {/* Stacked cards: peek from behind main card at top */}
        <div className="absolute inset-x-5 top-0 bottom-3 rounded-2xl bg-muted ring-2 ring-border shadow-md" />
        <div className="absolute inset-x-2.5 top-1.5 bottom-1.5 rounded-2xl bg-card ring-2 ring-border/70 shadow-sm" />
        <CutoutCard className={cn(cutoutCardSurfaceClassName, 'relative z-10 flex-1 select-none group/card cursor-pointer grid grid-rows-[auto_1fr]')}>
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
              <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-card px-2.5 py-1 text-[11px] font-semibold text-amber-500 tabular-nums shadow-md ring-1 ring-border/40 flex items-center gap-1">
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

          <CutoutCardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="flex-1 text-sm font-semibold leading-snug line-clamp-2 text-foreground">
                {playlist.name}
              </p>
              {playlist.topic && (
                <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                  {playlist.topic}
                </span>
              )}
            </div>
            <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground overflow-hidden">
              {formatPublishedAt(playlist.published_at) && (
                <span className="flex items-center gap-1 shrink-0" title={playlist.published_at ?? ''}>
                  <Calendar className="size-3.5" />
                  {formatPublishedAt(playlist.published_at)}
                </span>
              )}
              {playlist.channel && (
                <span className="flex items-center gap-1 min-w-0 overflow-hidden" title={playlist.channel}>
                  <Tv className="size-3.5 shrink-0" />
                  <span className="line-clamp-1">{playlist.channel}</span>
                </span>
              )}
            </div>
          </CutoutCardContent>
        </CutoutCard>
      </div>
    </Link>
  )
}
