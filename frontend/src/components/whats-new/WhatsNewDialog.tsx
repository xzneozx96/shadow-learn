import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { getChangelog, getLatestAnnouncementId } from '@/lib/changelog'
import { captureWhatsNewChangelogOpened, captureWhatsNewModalDismissed, captureWhatsNewModalShown } from '@/lib/posthog-events'
import { hasUnseenAnnouncement, markAnnouncementSeen } from '@/lib/whats-new'

const TAG_CLASSES = {
  new: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
  improved: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  fixed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
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
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('whatsNew.modalTitle')}</DialogTitle>
          <DialogDescription>
            {latest.highlights.length}
            {' '}
            {t('whatsNew.updatesSuffix')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 py-1">
          {latest.highlights.map(item => (
            <div key={`${item.tag}-${item.text}`} className="flex items-start gap-2.5">
              <Badge
                className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 h-auto border ${TAG_CLASSES[item.tag]}`}
              >
                {t(`whatsNew.tag.${item.tag}` as Parameters<typeof t>[0])}
              </Badge>
              <span className="text-sm text-muted-foreground leading-snug">{item.text}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:flex-row">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            {t('whatsNew.dismiss')}
          </Button>
          <Button size="sm" onClick={handleSeeChangelog}>
            {t('whatsNew.seeChangelog')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
