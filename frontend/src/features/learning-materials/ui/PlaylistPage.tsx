import { ChevronLeft, ListVideo } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'
import { usePlaylist } from '@/features/learning-materials/application/usePlaylist'
import { VideoCard } from '@/features/learning-materials/ui/collection/VideoCard'
import { useLessons } from '@/features/lesson/application/LessonsContext'
import { Badge } from '@/shared/ui/badge'
import { EmptyState } from '@/shared/ui/EmptyState'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function PlaylistPageSkeleton() {
  return (
    <div className="px-6 md:px-10 py-10 animate-pulse">
      <div className="h-8 w-80 rounded-md bg-muted mb-3" />
      <div className="h-5 w-24 rounded-full bg-muted mb-10" />
      <div className="h-6 w-48 rounded-md bg-muted mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }, (_, i) => i).map(i => (
          <div key={i}>
            <div className="aspect-video rounded-xl bg-muted" />
            <div className="mt-3 h-4 w-3/4 rounded-md bg-muted" />
            <div className="mt-2 h-3 w-1/2 rounded-md bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlaylistPage() {
  const { playlistId } = useParams<{ playlistId: string }>()
  const { data, loading, error } = usePlaylist(playlistId!)
  const { lessons } = useLessons()
  const { t } = useI18n()
  const navigate = useNavigate()

  const createdSet = useMemo(() => {
    const set = new Set<string>()
    for (const l of lessons) {
      if (l.sourceUrl) {
        const m = l.sourceUrl.match(YOUTUBE_ID_REGEX)
        const id = m?.[1] ?? m?.[2]
        if (id)
          set.add(id)
      }
    }
    return set
  }, [lessons])

  return (
    <Layout>
      <div className="relative z-5 h-full overflow-y-auto">
        {loading && <PlaylistPageSkeleton />}

        {error && (
          <div className="px-6 md:px-10 py-12">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Compact header */}
            <div className="px-6 md:px-10 pt-8 pb-8">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="group flex items-center gap-2 text-left transition-colors duration-150"
              >
                <ChevronLeft className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <h3 className="text-lg md:text-xl font-bold tracking-[-0.02em] text-foreground text-balance">
                  {data.name}
                </h3>
                <div className="flex items-center gap-2 ml-2">
                  <Badge variant="secondary" className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                    <ListVideo className="size-4" />
                    {data.videos.length}
                  </Badge>
                  {data.topic && (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {data.topic}
                    </Badge>
                  )}
                </div>
              </button>
            </div>

            {/* Video grid */}
            <div className="px-6 md:px-10 pb-16">
              {data.videos.length === 0
                ? (
                    <EmptyState
                      className="rounded-2xl border border-dashed border-border/80 bg-muted/20 py-20"
                      icon={<ListVideo className="size-7 text-primary/65" strokeWidth={1.25} />}
                      description={t('collection.playlistEmpty')}
                    />
                  )
                : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-5">
                      {data.videos.map((v, i) => (
                        <VideoCard
                          key={`${v.video_id}-${i}`}
                          video={v}
                          alreadyCreated={createdSet.has(v.video_id)}
                          showCreateLesson={v.content_type !== 'tip'}
                          showTopic={false}
                          wrapperClassName="w-full min-w-0 h-full"
                        />
                      ))}
                    </div>
                  )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
