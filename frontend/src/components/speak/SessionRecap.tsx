import { Clock, MessageCircle, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'

// TODO: Import from hooks/useSpeakSession.ts in Task 9
// import { useSpeakSession } from '@/hooks/useSpeakSession'

interface SessionRecapProps {
  onClose: () => void
  onRepeat: () => void
}

export function SessionRecap({ onClose, onRepeat }: SessionRecapProps) {
  const { t } = useI18n()

  // Placeholder for useSpeakSession hook (will be implemented in Task 9)
  // Replace this with: const speakSession = useSpeakSession()
  const speakSession = {
    situation: null as string | null,
    persona: null as { name: string, level: string } | null,
    messages: [] as { role: 'user' | 'ai', text: string }[],
    score: null as number | null,
    startedAt: null as Date | null,
    stoppedAt: null as Date | null,
  }

  const situation = speakSession.situation ?? ''
  const persona = speakSession.persona
  const messages = speakSession.messages
  const score = speakSession.score
  const startTime = speakSession.startedAt
  const endTime = speakSession.stoppedAt

  // Calculate duration
  const duration = startTime && endTime
    ? Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    : 0
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  // Calculate turns
  const userTurns = messages.filter(m => m.role === 'user').length

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold">{t('speak.sessionComplete')}</h3>
        <p className="text-muted-foreground mt-1">
          {t('speak.summaryDesc', { situation, persona: persona?.name ?? '' })}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-center gap-1">
              <Clock className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold">
              {minutes}
              :
              {seconds.toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-muted-foreground">{t('speak.duration')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-center gap-1">
              <MessageCircle className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold">{userTurns}</div>
            <p className="text-xs text-muted-foreground">{t('speak.turns')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-center gap-1">
              <Star className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold">
              {score !== null ? `${score}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">{t('speak.score')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Message preview */}
      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('speak.conversationPreview')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {messages.slice(-5).map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}`}
                className={`text-sm ${msg.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                <span className="font-medium">
                  {msg.role === 'user' ? t('speak.you') : t('speak.ai')}
                  :
                </span>
                {' '}
                {msg.text.length > 100 ? `${msg.text.slice(0, 100)}...` : msg.text}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          {t('common.done')}
        </Button>
        <Button className="flex-1" onClick={onRepeat}>
          {t('speak.repeatSession')}
        </Button>
      </div>
    </div>
  )
}
