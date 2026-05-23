import type { ReactNode } from 'react'
import type { HubItem, HubVideo } from '@/features/learning-materials/domain/collection'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { computeScrollState } from '@/shared/lib/carousel'
import { Button } from '@/shared/ui/button'
import { PlaylistCard } from './PlaylistCard'
import { VideoCard } from './VideoCard'

interface HubRowProps {
  label: string
  items: HubItem[]
  activeTopic: string | null
  createdSet: Set<string>
  renderItem?: (item: HubItem) => ReactNode
}

export function HubRow({ label, items, activeTopic, createdSet, renderItem }: HubRowProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
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

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    scrollRef.current = el
    if (!el)
      return
    let rafId = 0
    const onChange = () => {
      if (rafId)
        return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        updateScrollState(el)
      })
    }
    const ro = new ResizeObserver(onChange)
    const mo = new MutationObserver(onChange)
    el.addEventListener('scroll', onChange, { passive: true })
    ro.observe(el)
    mo.observe(el, { childList: true })
    cleanupRef.current = () => {
      el.removeEventListener('scroll', onChange)
      ro.disconnect()
      mo.disconnect()
      if (rafId)
        cancelAnimationFrame(rafId)
    }
    updateScrollState(el)
  }, [updateScrollState])

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
          ref={setScrollRef}
          className="flex items-stretch gap-5 overflow-x-auto px-2 py-3 -my-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filteredItems.map((item, i) => {
            const key = item.type === 'playlist' ? item.playlist_id : `${item.video_id}-${i}`
            if (renderItem)
              return <Fragment key={key}>{renderItem(item)}</Fragment>
            return item.type === 'playlist'
              ? (
                  <PlaylistCard key={key} playlist={item} />
                )
              : (
                  <VideoCard
                    key={key}
                    video={item as HubVideo}
                    alreadyCreated={createdSet.has(item.video_id)}
                    showCreateLesson={item.content_type !== 'tip'}
                  />
                )
          })}
        </div>
      </div>
    </section>
  )
}
