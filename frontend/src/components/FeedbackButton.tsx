import { ThumbsUp } from 'lucide-react'
import { useMatch } from 'react-router-dom'
import { useI18n } from '@/contexts/I18nContext'
import { posthog } from '@/lib/posthog'
import { Button } from './ui/button'

export function FeedbackButton() {
  const { t } = useI18n()
  const isLessonRoute = useMatch('/lesson/:id') !== null

  return (
    <Button
      size="lg"
      onClick={() => posthog.capture('feedback_button_clicked')}
      className={`fixed bottom-20 z-50 transition-transform hover:scale-105 active:scale-95 ${
        isLessonRoute ? 'left-6' : 'right-6'
      }`}
      aria-label="Give feedback"
    >
      <ThumbsUp className="size-5" />
      {t('settings.giveFeedback')}
    </Button>
  )
}
