import { Loader2, Play } from 'lucide-react'
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
        <div className="w-full px-10 pt-4 pb-20">
          <header className="mb-11">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary mb-3">
              <Play className="size-2.5" />
              {t('collection.eyebrow')}
            </span>
            <h1 className="text-[30px] font-bold tracking-tight text-white/95 leading-[1.1]">
              {t('collection.title')}
            </h1>
            <p className="mt-1.5 text-[13px] text-white/45">
              {t('collection.subtitle')}
            </p>
          </header>

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="size-6 animate-spin text-white/40" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-[13px] text-red-300">
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
