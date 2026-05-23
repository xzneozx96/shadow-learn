import type { TipGroup } from '@/features/learning-materials/domain/collection'
import { Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'
import { useCollection } from '@/features/learning-materials/application/useCollection'
import { useUserMaterials } from '@/features/learning-materials/application/useUserMaterials'
import { HubRow } from '@/features/learning-materials/ui/collection/HubRow'
import { UserMaterialCard } from '@/features/learning-materials/ui/collection/UserMaterialCard'
import { useLessons } from '@/features/lesson/application/LessonsContext'
import { cn } from '@/shared/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button, buttonVariants } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/EmptyState'

const YOUTUBE_ID_REGEX = /[?&]v=([^&]+)|youtu\.be\/([^?&]+)/

function HubRowSkeleton() {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-3 w-16 rounded-md bg-muted/70 animate-pulse" />
      </div>
      <div className="flex gap-5 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => i).map(i => (
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

type ActiveTab = 'materials' | 'tips' | 'mine'

function MineSection({
  groups,
  loading,
  onRegister,
  onDelete,
  createdSet,
}: {
  groups: TipGroup[]
  loading: boolean
  onRegister: () => void
  onDelete: (id: string) => void
  createdSet: Set<string>
}) {
  const { t } = useI18n()
  if (loading)
    return <HubRowSkeleton />

  const isEmpty = groups.length === 0

  return (
    <>
      {!isEmpty && (
        <div className="mt-6 flex items-center justify-between">
          <Button size="lg" onClick={onRegister}>{t('collection.register')}</Button>
        </div>
      )}

      {isEmpty
        ? (
            <EmptyState
              className="mt-16 min-h-[340px]"
              icon={<Lightbulb className="size-7 text-primary/65" strokeWidth={1.25} />}
              description={t('collection.mineEmpty')}
              action={{ label: t('collection.registerFirst'), onClick: onRegister }}
            />
          )
        : groups.map(g => (
            <HubRow
              key={g.skill}
              label={g.skill}
              items={g.items}
              activeTopic={null}
              createdSet={createdSet}
              renderItem={item => (
                <UserMaterialCard
                  item={item as any}
                  onDelete={onDelete}
                />
              )}
            />
          ))}
    </>
  )
}

export function CollectionPage() {
  const { t } = useI18n()
  const { data, loading, error } = useCollection()
  const { lessons } = useLessons()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: ActiveTab
    = rawTab === 'tips'
      ? 'tips'
      : rawTab === 'mine'
        ? 'mine'
        : 'materials'
  const activeTopic = searchParams.get('topic')

  const navigate = useNavigate()
  const userMats = useUserMaterials()
  const { revalidateAll } = userMats
  useEffect(() => {
    if (activeTab === 'mine')
      void revalidateAll()
  }, [activeTab, revalidateAll])

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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

  const materialsCount = data
    ? data.materials.groups.reduce((sum, g) => sum + g.items.length, 0)
    : null
  const tipsCount = data
    ? data.tips.groups.reduce((sum, g) => sum + g.items.length, 0)
    : null

  const handleTabSwitch = (tab: ActiveTab) => {
    if (tab === 'materials')
      setSearchParams({})
    else
      setSearchParams({ tab })
  }

  const handleTopicClick = (topic: string) => {
    setSearchParams(activeTopic === topic ? {} : { topic })
  }

  return (
    <Layout>
      <div className="h-full overflow-y-auto">
        <div className="relative z-5 px-6 md:px-10 py-12">
          <header>
            <h1 className="text-2xl xl:text-3xl font-bold tracking-[-0.03em] leading-[0.95] text-foreground text-balance">
              {t('collection.title')}
            </h1>
            <p className="mt-2 text-base md:text-lg leading-relaxed text-muted-foreground text-pretty max-w-3xl">
              {activeTab === 'materials'
                ? t('collection.materialsSubtitle')
                : t('collection.tipsSubtitle')}
            </p>
          </header>

          {/* Tab bar */}
          <div className="mt-8 flex items-center gap-1 border-b">
            {(['materials', 'tips', 'mine'] as const).map((tab) => {
              const count = tab === 'materials'
                ? materialsCount
                : tab === 'tips'
                  ? tipsCount
                  : userMats.groups.reduce((s, g) => s + g.items.length, 0)
              const label = tab === 'materials'
                ? t('collection.tabMaterials')
                : tab === 'tips'
                  ? t('collection.tabTips')
                  : t('collection.tabMine')
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabSwitch(tab)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150',
                    activeTab === tab
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums',
                      activeTab === tab ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {count ?? '—'}
                  </span>
                </button>
              )
            })}
          </div>

          {loading && (
            <>
              <HubRowSkeleton />
              <HubRowSkeleton />
            </>
          )}

          {error && (
            <div className="mt-10 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('collection.loadError')}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {activeTab === 'materials' && (
                <>
                  {/* Topic chips */}
                  {data.materials.topics.length > 0 && (
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSearchParams({})}
                        className={cn(
                          'px-3 py-2 rounded-full text-xs font-medium transition-colors duration-150',
                          activeTopic === null
                            ? 'bg-foreground text-background'
                            : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t('collection.allTopics')}
                      </button>
                      {data.materials.topics.map(topic => (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => handleTopicClick(topic)}
                          className={cn(
                            'px-3 py-2 rounded-full text-xs font-medium transition-colors duration-150',
                            activeTopic === topic
                              ? 'bg-foreground text-background'
                              : 'bg-secondary text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  )}

                  {data.materials.groups.map(g => (
                    <HubRow
                      key={g.difficulty}
                      label={g.difficulty}
                      items={g.items}
                      activeTopic={activeTopic}
                      createdSet={createdSet}
                    />
                  ))}
                </>
              )}

              {activeTab === 'tips' && (
                data.tips.groups.length === 0
                  ? (
                      <EmptyState
                        className="mt-16 min-h-[340px]"
                        icon={<Lightbulb className="size-7 text-primary/65" strokeWidth={1.25} />}
                        description={t('collection.tipsEmpty')}
                      />
                    )
                  : data.tips.groups.map(g => (
                      <HubRow
                        key={g.skill}
                        label={g.skill}
                        items={g.items}
                        activeTopic={null}
                        createdSet={createdSet}
                      />
                    ))
              )}
            </>
          )}

          {activeTab === 'mine' && (
            <MineSection
              groups={userMats.groups}
              loading={userMats.loading}
              onRegister={() => navigate('/collection/register')}
              onDelete={id => setPendingDeleteId(id)}
              createdSet={createdSet}
            />
          )}
        </div>
      </div>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={v => !v && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('collection.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('collection.deleteConfirm.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={async () => {
                const id = pendingDeleteId
                if (!id)
                  return
                setPendingDeleteId(null)
                await userMats.remove(id)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  )
}
