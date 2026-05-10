import { PlaylistRow } from '@/components/collection/PlaylistRow'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'
import { useCollection } from '@/hooks/useCollection'

function PlaylistSkeleton() {
  return (
    <section className="mb-14">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-3 w-16 rounded-md bg-muted/70 animate-pulse" />
      </div>
      <div className="flex gap-5 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[calc(25%-15px)] min-w-[260px]">
            <div className="aspect-video rounded-xl bg-muted animate-pulse" />
            <div className="mt-3 h-4 w-3/4 rounded-md bg-muted animate-pulse" />
            <div className="mt-2 h-3 w-1/2 rounded-md bg-muted/70 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function CollectionPage() {
  const { t } = useI18n()
  const { data, loading, error } = useCollection()

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        <div className="px-6 md:px-10 py-12">
          <header>
            <h1 className="text-2xl xl:text-3xl font-bold tracking-[-0.03em] leading-[0.95] text-foreground text-balance">
              {t('collection.title')}
            </h1>
            <p className="mt-2 text-base md:text-lg leading-relaxed text-muted-foreground text-pretty max-w-2xl">
              {t('collection.subtitle')}
            </p>
          </header>

          {loading && (
            <>
              <PlaylistSkeleton />
              <PlaylistSkeleton />
            </>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
            </div>
          )}

          {!loading && !error && data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-8 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {t('collection.loadError')}
              </p>
            </div>
          )}

          {data?.map(p => (
            <PlaylistRow key={p.playlist_id} playlist={p} />
          ))}
        </div>
      </div>
    </Layout>
  )
}
