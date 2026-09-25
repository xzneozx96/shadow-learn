import type { ChangelogEntry } from '@/shared/lib/changelog'
import { Sparkles, Wrench, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Layout } from '@/app/Layout'
import { useI18n } from '@/app/providers/I18nContext'
import { getChangelog, getLatestAnnouncementId } from '@/shared/lib/changelog'
import { captureWhatsNewChangelogOpened } from '@/shared/lib/posthog-events'
import { hasUnseenAnnouncement, markAnnouncementSeen } from '@/shared/lib/whats-new'
import { Badge } from '@/shared/ui/badge'

const TAG_UI = {
  new: {
    icon: Sparkles,
    badge: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  },
  improved: {
    icon: Zap,
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  },
  fixed: {
    icon: Wrench,
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
} as const

// Maps app Locale to Intl locale string
const INTL_LOCALE = { en: 'en-US', vi: 'vi-VN' } as const

function formatDate(date: string, intlLocale: string, options: Intl.DateTimeFormatOptions): string {
  // Append noon UTC to avoid timezone offset shifting the date
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(intlLocale, options)
}

function SidebarEntry({
  entry,
  isActive,
  isNew,
  intlLocale,
  onClick,
}: {
  entry: ChangelogEntry
  isActive: boolean
  isNew: boolean
  intlLocale: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex flex-col pl-4 pr-3 py-2 transition-colors relative border-r-2 ${
        isActive
          ? 'border-primary'
          : 'border-transparent hover:border-border hover:bg-white/5'
      }`}
    >
      <span className="text-xs text-muted-foreground tabular-nums mb-0.5 flex items-center gap-1.5 uppercase tracking-wide">
        {formatDate(entry.date, intlLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
        {isNew && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
      </span>
      <span className={`text-sm leading-snug truncate ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {entry.title}
      </span>
    </button>
  )
}

export function ChangelogPage() {
  const { locale, t } = useI18n()
  const intlLocale = INTL_LOCALE[locale]
  const entries = getChangelog(locale)
  const latestId = getLatestAnnouncementId()
  const contentRef = useRef<HTMLDivElement>(null)

  const [selectedId, setSelectedId] = useState(() => {
    const hash = window.location.hash.slice(1)
    return hash || entries[0]?.id || ''
  })

  // Mark seen + fire PostHog on mount
  useEffect(() => {
    if (latestId) {
      markAnnouncementSeen(latestId)
      captureWhatsNewChangelogOpened({ announcement_id: latestId, locale, source: 'nav' })
    }
  }, [latestId, locale])

  // Sync selection from browser back/forward
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.slice(1)
      if (hash)
        setSelectedId(hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function selectEntry(id: string) {
    setSelectedId(id)
    window.location.hash = id
    contentRef.current?.scrollTo({ top: 0 })
  }

  const selectedEntry = entries.find(e => e.id === selectedId) ?? entries[0]
  const isLatestUnseen = hasUnseenAnnouncement(latestId)

  if (entries.length === 0) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('whatsNew.noEntries')}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="relative z-5 flex h-full w-full flex-col overflow-hidden font-sans text-foreground lg:flex-row">
        {/* Left Sidebar */}
        <aside className="flex max-h-40 w-full shrink-0 flex-col border-b border-border lg:h-full lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
          {/* Sidebar header */}
          <div className="border-b border-border px-4 py-3 lg:px-5 lg:py-5">
            <h2 className="text-sm font-semibold text-foreground">{t('changelog.title')}</h2>
          </div>

          {/* Entry list */}
          <nav className="flex-1 overflow-y-auto space-y-0.5 scrollbar-hide">
            {entries.map(entry => (
              <SidebarEntry
                key={entry.id}
                entry={entry}
                isActive={entry.id === selectedEntry?.id}
                isNew={entry.id === latestId && isLatestUnseen}
                intlLocale={intlLocale}
                onClick={() => selectEntry(entry.id)}
              />
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main ref={contentRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {selectedEntry && (
            <div className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-8 lg:px-12 lg:py-16 lg:pb-32">
              {/* Entry header */}
              <div className="mb-10 pb-6 border-b border-border/20">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                  {formatDate(selectedEntry.date, intlLocale, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {selectedEntry.title}
                </h1>
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.tags.map((tag) => {
                    const ui = TAG_UI[tag as keyof typeof TAG_UI]
                    const Icon = ui.icon
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={`h-auto flex items-center gap-1.5 px-3 py-1 text-xs font-bold border uppercase tracking-wider ${ui.badge}`}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                        {t(`whatsNew.tag.${tag}` as Parameters<typeof t>[0])}
                      </Badge>
                    )
                  })}
                </div>
              </div>

              {/* Video */}
              {selectedEntry.video && (
                <video
                  controls
                  className="w-full rounded-xl mb-10 bg-muted shadow-sm border border-border/50"
                  src={selectedEntry.video}
                />
              )}

              {/* Markdown body */}
              <div className="prose prose-invert prose-base max-w-none
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
                prose-h2:mt-12 prose-h2:mb-6 prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-2
                prose-h3:mt-8 prose-h3:mb-4
                prose-a:text-primary hover:prose-a:text-primary/80 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-input prose-pre:border prose-pre:border-border/20 prose-pre:rounded-lg
                prose-li:text-muted-foreground
                prose-blockquote:border-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:font-normal prose-blockquote:text-muted-foreground
                prose-img:rounded-xl prose-img:border prose-img:border-border/20 prose-img:my-8
              "
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedEntry.body}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </main>
      </div>
    </Layout>
  )
}
