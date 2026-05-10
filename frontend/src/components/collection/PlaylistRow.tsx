import type { CollectionPlaylist } from '@/types/collection'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { computeScrollState } from '@/lib/carousel'
import { VideoCard } from './VideoCard'

interface PlaylistRowProps {
  playlist: CollectionPlaylist
}

export function PlaylistRow({ playlist }: PlaylistRowProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

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
    const onScroll = () => updateScrollState(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    const onResize = () => updateScrollState(el)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [updateScrollState, playlist.videos.length])

  const scroll = (dir: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({ left: dir === 'next' ? 600 : -600, behavior: 'smooth' })
  }

  return (
    <section className="mb-12">
      <header className="flex items-center gap-2.5 mb-5">
        <div className="flex items-center justify-center size-7 rounded-lg border border-border bg-muted text-sm shrink-0">
          {playlist.icon}
        </div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{playlist.name}</h2>
        <span className="text-xs text-muted-foreground">
          {t('collection.videoCount', { count: playlist.videos.length })}
        </span>
        <div className="flex-1 h-px bg-border mx-2" />
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
      </header>

      <div
        ref={scrollRef}
        className="flex items-stretch gap-5 overflow-x-auto py-3 -my-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (e.deltaY === 0)
            return
          e.preventDefault()
          e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        {playlist.videos.map(v => (
          <VideoCard key={v.video_id} video={v} />
        ))}
      </div>
    </section>
  )
}
