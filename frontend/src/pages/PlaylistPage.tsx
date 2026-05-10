import { ChevronLeft } from 'lucide-react'
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
      <div className="flex gap-6 mb-10">
        <div className="w-52 aspect-video rounded-xl bg-muted shrink-0" />
        <div className="flex flex-col gap-3 pt-2">
          <div className="h-6 w-64 rounded-md bg-muted" />
          <div className="h-4 w-32 rounded-md bg-muted/70" />
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
            {/* Header */}
            <div className="px-6 md:px-10 pt-10 pb-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/collection')}
                className="-ml-2 mb-6 text-muted-foreground hover:text-foreground gap-1.5"
              >
                <ChevronLeft className="size-4" />
                {t('collection.backToCollection')}
              </Button>

              <div className="flex flex-col sm:flex-row gap-6">
                {data.thumbnail_url
                  ? (
                      <img
                        src={data.thumbnail_url}
                        alt={data.name}
                        className="w-full sm:w-52 aspect-video object-cover rounded-xl shrink-0"
                      />
                    )
                  : (
                      <div className="w-full sm:w-52 aspect-video rounded-xl shrink-0 bg-linear-to-br from-secondary via-muted to-secondary" />
                    )}
                <div className="flex flex-col gap-2 pt-1">
                  {data.topic && (
                    <span className="inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
                      {data.topic}
                    </span>
                  )}
                  <h1 className="text-2xl xl:text-3xl font-bold tracking-[-0.03em] leading-[0.95] text-foreground text-balance">
                    {data.name}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {t('collection.videoCount', { count: data.videos.length })}
                  </p>
                </div>
              </div>
            </div>

            {/* Video grid */}
            <div className="px-6 md:px-10 pb-12">
              <h2 className="text-lg font-semibold tracking-[-0.02em] mb-5">
                {t('collection.lessonList')}
              </h2>
              {data.videos.length === 0
                ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-8 py-16 text-center">
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
