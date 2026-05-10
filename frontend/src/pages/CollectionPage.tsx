import { Loader2 } from 'lucide-react'
import { PlaylistRow } from '@/components/collection/PlaylistRow'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'
import { useCollection } from '@/hooks/useCollection'

export function CollectionPage() {
  const { t } = useI18n()
  const { data, loading, error } = useCollection()

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full container px-6 py-9 pb-10">
          <header className="mb-10">
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tighter leading-none text-foreground">
              {t('collection.title')}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground italic">
              {t('collection.subtitle')}
            </p>
          </header>

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
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
