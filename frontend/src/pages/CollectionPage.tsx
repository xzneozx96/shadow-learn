import type { TipGroup } from '@/types/collection'
import { Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HubRow } from '@/components/collection/HubRow'
import { RegisterMaterialModal } from '@/components/collection/RegisterMaterialModal'
import { UserMaterialCard } from '@/components/collection/UserMaterialCard'
import { EmptyState } from '@/components/EmptyState'
import { Layout } from '@/components/Layout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { useCollection } from '@/hooks/useCollection'
import { useUserMaterials } from '@/hooks/useUserMaterials'
import { cn } from '@/lib/utils'

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

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {groups.reduce((s, g) => s + g.items.length, 0)}
          {' '}
          {t('collection.mineItemCount')}
        </div>
        <Button size="sm" onClick={onRegister}>{t('collection.register')}</Button>
      </div>

      {groups.length === 0
        ? (
            <EmptyState
              className="mt-10 rounded-2xl border border-dashed border-border/80 bg-muted/20 py-16"
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

  const userMats = useUserMaterials()
  useEffect(() => {
    if (activeTab === 'mine')
      void userMats.revalidateAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]) // intentionally omit userMats to avoid revalidate loop

  const [registerOpen, setRegisterOpen] = useState(false)
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
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150',
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
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150',
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
                        className="mt-16 rounded-2xl border border-dashed border-border/80 bg-muted/20 py-16"
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
              onRegister={() => setRegisterOpen(true)}
              onDelete={id => setPendingDeleteId(id)}
              createdSet={createdSet}
            />
          )}
        </div>
      </div>

      <RegisterMaterialModal open={registerOpen} onClose={() => setRegisterOpen(false)} />

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={v => !v && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('collection.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('collection.deleteConfirm.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
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
