import { ThumbsUp } from 'lucide-react'
import { useMatch } from 'react-router-dom'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { posthog } from '@/lib/posthog'
import { Button } from './ui/button'

export function FeedbackButton() {
  const { t } = useI18n()
  const isLessonRoute = useMatch('/lesson/:id') !== null
  const { isGlobalPanelOpen } = useGlobalCompanionContext()

  const onLeft = isLessonRoute || isGlobalPanelOpen

  return (
    <Button
      size="lg"
      onClick={() => posthog.capture('feedback_button_clicked')}
      className={`fixed bottom-20 z-50 transition-all duration-300 hover:scale-105 active:scale-95 ${
        onLeft ? 'left-6' : 'right-6'
      }`}
      aria-label="Give feedback"
    >
      <ThumbsUp className="size-5" />
      {t('settings.giveFeedback')}
    </Button>
  )
}
