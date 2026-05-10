import { ChevronLeft, ListVideo } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VideoCard } from '@/components/collection/VideoCard'
import { Layout } from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlaylist } from '@/hooks/usePlaylist'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function PlaylistPageSkeleton() {
  return (
    <div className="px-6 md:px-10 py-10 animate-pulse">
      <div className="h-8 w-80 rounded-md bg-muted mb-3" />
      <div className="h-5 w-24 rounded-full bg-muted mb-10" />
      <div className="h-6 w-48 rounded-md bg-muted mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
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
      <div className="h-full overflow-y-auto">
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
                onClick={() => navigate('/collection')}
                className="group flex items-center gap-2 text-left transition-colors duration-150 hover:text-foreground"
              >
                <ChevronLeft className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <h1 className="text-xl md:text-2xl font-bold tracking-[-0.02em] text-foreground text-balance">
                  {data.name}
                </h1>
                {data.topic && (
                  <Badge variant="secondary" className="ml-1 text-xs font-medium">
                    {data.topic}
                  </Badge>
                )}
              </button>
            </div>

            {/* Video grid */}
            <div className="px-6 md:px-10 pb-16">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {t('collection.lessonList')}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-secondary text-muted-foreground">
                  <ListVideo className="size-3" />
                  {data.videos.length}
                </span>
              </div>
              {data.videos.length === 0
                ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-8 py-20 text-center">
                      <ListVideo className="size-10 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        {t('collection.playlistEmpty')}
                      </p>
                    </div>
                  )
                : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
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
