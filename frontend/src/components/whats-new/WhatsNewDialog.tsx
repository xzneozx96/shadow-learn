import { Gift, Sparkles, Wrench, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { getChangelog, getLatestAnnouncementId } from '@/lib/changelog'
import { captureWhatsNewChangelogOpened, captureWhatsNewModalDismissed, captureWhatsNewModalShown } from '@/lib/posthog-events'
import { hasUnseenAnnouncement, markAnnouncementSeen } from '@/lib/whats-new'

const TAG_UI = {
  new: {
    icon: Sparkles,
    bg: 'bg-green-500/10',
    iconColor: 'stroke-green-600 dark:stroke-green-400',
    badge: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  },
  improved: {
    icon: Zap,
    bg: 'bg-indigo-500/10',
    iconColor: 'stroke-indigo-600 dark:stroke-indigo-400',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  },
  fixed: {
    icon: Wrench,
    bg: 'bg-amber-500/10',
    iconColor: 'stroke-amber-600 dark:stroke-amber-400',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
} as const

export function WhatsNewDialog() {
  const { locale, t } = useI18n()
  const navigate = useNavigate()

  const latestId = getLatestAnnouncementId()
  const [open, setOpen] = useState(() => hasUnseenAnnouncement(latestId))

  const entries = getChangelog(locale)
  const latest = entries[0]

  useEffect(() => {
    if (open && latest) {
      captureWhatsNewModalShown({ announcement_id: latest.id, locale })
    }
  }, [open, latest, locale])

  if (!latest || !latestId)
    return null

  function handleDismiss() {
    markAnnouncementSeen(latestId!)
    captureWhatsNewModalDismissed({ announcement_id: latest!.id, locale })
    setOpen(false)
  }

  function handleSeeChangelog() {
    markAnnouncementSeen(latestId!)
    captureWhatsNewChangelogOpened({ announcement_id: latest!.id, locale, source: 'modal' })
    setOpen(false)
    navigate('/changelog')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v)
          handleDismiss()
      }}
    >
      <DialogContent showCloseButton={false} className="p-0">
        <div className="bg-muted/30 px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <Gift className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight mb-2">
            {t('whatsNew.modalTitle')}
          </DialogTitle>
          <DialogDescription className="text-base">
            {latest.highlights.length}
            {' '}
            {t('whatsNew.updatesSuffix')}
          </DialogDescription>
        </div>

        <div className="px-6 py-6">
          <div className="flex flex-col gap-6">
            {latest.highlights.map((item) => {
              const ui = TAG_UI[item.tag]
              const Icon = ui.icon
              return (
                <div key={`${item.tag}-${item.text}`} className="flex items-center gap-4">
                  <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ui.bg}`}>
                    <Icon className={`h-5 w-5 ${ui.iconColor}`} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[15px] text-foreground leading-relaxed">
                      {item.text}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-center border-t border-border/50 bg-muted/10 mt-2">
          <Button variant="outline" onClick={handleDismiss}>
            {t('whatsNew.dismiss')}
          </Button>
          <Button onClick={handleSeeChangelog}>
            {t('whatsNew.seeChangelog')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
