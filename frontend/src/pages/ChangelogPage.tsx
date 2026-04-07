import type { ChangelogEntry } from '@/lib/changelog'
import { Sparkles, Wrench, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Layout } from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/contexts/I18nContext'
import { getChangelog, getLatestAnnouncementId } from '@/lib/changelog'
import { captureWhatsNewChangelogOpened } from '@/lib/posthog-events'
import { hasUnseenAnnouncement, markAnnouncementSeen } from '@/lib/whats-new'

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
      className={`w-full text-left p-3.5 mb-1.5 rounded-xl transition-all duration-200 border ${
        isActive
          ? 'bg-primary/5 border-primary/20 shadow-sm'
          : 'border-transparent hover:bg-muted/60'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-semibold tracking-wide uppercase ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
          {formatDate(entry.date, intlLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        {isNew && (
          <Badge className="h-auto px-1.5 py-0.5 text-[9px] font-bold bg-primary/15 text-primary border-primary/20 uppercase tracking-wider">
            NEW
          </Badge>
        )}
      </div>
      <p className={`text-[14px] font-medium leading-snug ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
        {entry.title}
      </p>
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
      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <ScrollArea className="w-96 shrink-0 border-r border-border bg-background">
          <div className="p-4">
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
          </div>
        </ScrollArea>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          {selectedEntry && (
            <div className="prose prose-invert prose-base max-w-4xl mx-auto py-12">
              {/* Header */}
              <div className="mb-10">
                <p className="text-sm font-medium text-primary mb-4 tabular-nums tracking-wide uppercase">
                  {formatDate(selectedEntry.date, intlLocale, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-6 leading-tight">
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
                        className={`h-auto flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold border uppercase tracking-wider ${ui.badge}`}
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
              <div className="prose-custom text-base text-foreground/90 leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    a: ({ href, children }) => <a href={href} className="text-primary hover:text-primary/80 font-medium underline underline-offset-4 transition-colors">{children}</a>,
                    img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="rounded-xl w-full my-10 border border-border/50 shadow-sm" />,
                    h2: ({ children }) => <h2 className="text-2xl font-bold text-foreground tracking-tight mt-12 mb-6">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-xl font-semibold text-foreground tracking-tight mt-8 mb-4">{children}</h3>,
                    p: ({ children }) => <p className="mb-6 last:mb-0 leading-8">{children}</p>,
                    ul: ({ children }) => <ul className="list-outside list-disc pl-5 mb-6 space-y-3">{children}</ul>,
                    li: ({ children }) => <li className="pl-1 leading-normal">{children}</li>,
                    ol: ({ children }) => <ol className="list-outside list-decimal pl-5 mb-6 space-y-3">{children}</ol>,
                    pre: ({ children }) => <pre className="block bg-muted/50 p-4 rounded-xl text-sm font-mono overflow-x-auto mb-6 border border-border/50">{children}</pre>,
                    code: ({ className, children }) => <code className={className ?? 'bg-muted text-foreground px-1.5 py-0.5 rounded-md text-[0.9em] font-mono'}>{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-6 pr-4 py-3 rounded-r-lg italic my-8 text-foreground/80">{children}</blockquote>,
                  }}
                >
                  {selectedEntry.body}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
