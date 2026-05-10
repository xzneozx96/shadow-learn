import { CheckCheck, ChevronLeft, ListVideo } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VideoCard } from '@/components/collection/VideoCard'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { usePlaylist } from '@/hooks/usePlaylist'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function PlaylistPageSkeleton() {
  return (
    <div className="px-6 md:px-10 py-12 animate-pulse">
      <div className="h-5 w-32 rounded-md bg-muted mb-8" />
      <div className="flex flex-col md:flex-row gap-10 mb-12">
        <div className="w-full md:w-[440px] aspect-video rounded-2xl bg-muted shrink-0" />
        <div className="flex flex-col gap-4 justify-center pt-2">
          <div className="h-4 w-24 rounded-full bg-muted" />
          <div className="h-10 w-80 rounded-md bg-muted" />
          <div className="h-4 w-48 rounded-md bg-muted/70" />
        </div>
      </div>
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

  const createdCount = useMemo(
    () => data?.videos.filter(v => createdSet.has(v.video_id)).length ?? 0,
    [data, createdSet],
  )

  return (
    <Layout ambientThumbnail={data?.thumbnail_url}>
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
            <div className="relative">
              <div className="px-6 md:px-10 pt-8 pb-14">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/collection')}
                  className="-ml-2 mb-10 text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <ChevronLeft className="size-4" />
                  {t('collection.backToCollection')}
                </Button>

                <div className="flex flex-col md:flex-row gap-10 items-start">
                  {data.thumbnail_url
                    ? (
                        <div className="w-full md:w-[440px] shrink-0 rounded-2xl overflow-hidden ring-1 ring-border/50 shadow-2xl shadow-black/20 dark:shadow-black/40">
                          <img
                            src={data.thumbnail_url}
                            alt={data.name}
                            className="w-full aspect-video object-cover"
                          />
                        </div>
                      )
                    : (
                        <div className="w-full md:w-[440px] aspect-video rounded-2xl shrink-0 bg-linear-to-br from-secondary via-muted to-secondary ring-1 ring-border/50 shadow-2xl shadow-black/20 dark:shadow-black/40 flex items-center justify-center">
                          <ListVideo className="size-16 text-muted-foreground/40" />
                        </div>
                      )}

                  <div className="flex flex-col gap-5 justify-center md:pt-3 min-w-0 flex-1">
                    {data.topic && (
                      <span className="inline-flex w-fit items-center px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold bg-secondary/80 text-muted-foreground ring-1 ring-border/40 backdrop-blur-sm">
                        {data.topic}
                      </span>
                    )}
                    <h1 className="text-3xl md:text-4xl xl:text-5xl font-bold tracking-[-0.035em] leading-[1.0] text-foreground text-balance">
                      {data.name}
                    </h1>
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <ListVideo className="size-4" />
                        {t('collection.videoCount', { count: data.videos.length })}
                      </span>
                      {createdCount > 0 && (
                        <>
                          <span aria-hidden className="size-1 rounded-full bg-muted-foreground/40" />
                          <span className="flex items-center gap-1.5 tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCheck className="size-4" />
                            {createdCount}
                            {' / '}
                            {data.videos.length}
                            {' '}
                            {t('collection.created')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Video grid */}
            <div className="px-6 md:px-10 pb-16">
              <div className="flex items-baseline gap-3 mb-7">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
                  {t('collection.lessonList')}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-secondary text-muted-foreground">
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
