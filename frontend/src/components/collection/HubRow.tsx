import type { HubItem, HubVideo } from '@/types/collection'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { computeScrollState } from '@/lib/carousel'
import { PlaylistCard } from './PlaylistCard'
import { VideoCard } from './VideoCard'

interface HubRowProps {
  label: string
  items: HubItem[]
  activeTopic: string | null
  createdSet: Set<string>
}

export function HubRow({ label, items, activeTopic, createdSet }: HubRowProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const filteredItems = useMemo(
    () => activeTopic === null ? items : items.filter(item => item.topic === activeTopic),
    [items, activeTopic],
  )

  const updateScrollState = useCallback((el: HTMLDivElement) => {
    const s = computeScrollState(el.scrollLeft, el.clientWidth, el.scrollWidth)
    setCanScrollPrev(s.canScrollPrev)
    setCanScrollNext(s.canScrollNext)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el)
      return
    updateScrollState(el)
    let rafId = 0
    const onScroll = () => {
      if (rafId)
        return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        updateScrollState(el)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const onResize = () => updateScrollState(el)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (rafId)
        cancelAnimationFrame(rafId)
    }
  }, [updateScrollState, filteredItems.length])

  if (filteredItems.length === 0)
    return null

  const scroll = (dir: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({ left: dir === 'next' ? 600 : -600, behavior: 'smooth' })
  }

  return (
    <section className="mt-12">
      <header className="flex items-end justify-between gap-4 mb-5">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground truncate">
            {label}
          </h2>
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium tabular-nums bg-secondary text-muted-foreground shrink-0">
            {t('collection.videoCount', { count: filteredItems.length })}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => scroll('prev')}
            disabled={!canScrollPrev}
            aria-label={t('collection.scrollPrev')}
            className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon-lg"
            variant="outline"
            onClick={() => scroll('next')}
            disabled={!canScrollNext}
            aria-label={t('collection.scrollNext')}
            className="transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <div className="relative -mx-2">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-background to-transparent transition-opacity duration-200 ${canScrollPrev ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background to-transparent transition-opacity duration-200 ${canScrollNext ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          ref={scrollRef}
          className="flex items-stretch gap-5 overflow-x-auto px-2 py-3 -my-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filteredItems.map((item, i) =>
            item.type === 'playlist'
              ? (
                  <PlaylistCard key={item.playlist_id} playlist={item} />
                )
              : (
                  <VideoCard
                    key={`${item.video_id}-${i}`}
                    video={item as HubVideo}
                    alreadyCreated={createdSet.has(item.video_id)}
                    showCreateLesson={item.content_type !== 'tip'}
                  />
                ),
          )}
        </div>
      </div>
    </section>
  )
}
