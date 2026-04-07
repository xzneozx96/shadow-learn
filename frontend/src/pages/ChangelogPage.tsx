import type { ChangelogEntry, ChangelogTag } from '@/lib/changelog'
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

// Tailwind classes for tag badges — matches WhatsNewDialog
const TAG_CLASSES: Record<ChangelogTag, string> = {
  new: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
  improved: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  fixed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
}

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
      className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
        isActive
          ? 'bg-accent border-primary'
          : 'border-transparent hover:bg-accent/50'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
          {formatDate(entry.date, intlLocale, { month: 'short', year: 'numeric' })}
        </span>
        {isNew && (
          <Badge className="h-auto px-1 py-px text-[9px] font-bold bg-primary/15 text-primary border-primary/20">
            NEW
          </Badge>
        )}
      </div>
      <p className={`text-xs font-medium leading-snug ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
        {entry.title}
      </p>
      <div className="flex gap-1 mt-1.5">
        {entry.tags.map(tag => (
          <span
            key={tag}
            className={`inline-block size-1.5 rounded-full ${
              tag === 'new' ? 'bg-green-500' : tag === 'improved' ? 'bg-indigo-400' : 'bg-amber-500'
            }`}
          />
        ))}
      </div>
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
        <ScrollArea className="w-52 shrink-0 border-r border-border">
          <div className="py-2">
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
            <div className="max-w-2xl px-8 py-8">
              {/* Header */}
              <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
                {selectedEntry.title}
              </h1>
              <p className="text-sm text-muted-foreground mb-3">
                {formatDate(selectedEntry.date, intlLocale, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex gap-1.5 mb-6">
                {selectedEntry.tags.map(tag => (
                  <Badge
                    key={tag}
                    className={`h-auto px-1.5 py-0.5 text-[10px] font-bold border ${TAG_CLASSES[tag]}`}
                  >
                    {t(`whatsNew.tag.${tag}` as Parameters<typeof t>[0])}
                  </Badge>
                ))}
              </div>

              {/* Video */}
              {selectedEntry.video && (
                <video
                  controls
                  className="w-full rounded-lg mb-6 bg-muted"
                  src={selectedEntry.video}
                />
              )}

              {/* Markdown body */}
              <div className="text-sm text-muted-foreground leading-relaxed space-y-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    a: ({ href, children }) => <a href={href} className="text-primary underline">{children}</a>,
                    img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="rounded-lg w-full my-4" />,
                    h2: ({ children }) => <h2 className="text-lg font-semibold text-foreground mt-6 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                    code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-4 italic">{children}</blockquote>,
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
