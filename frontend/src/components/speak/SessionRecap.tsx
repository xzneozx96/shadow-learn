import type { SpeakSession } from '@/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'

interface Persona {
  id: string
  name: string
  tagline: string
  portrait_url: string | null
}

interface Situation {
  id: string
  name: string
  description: string
}

interface SessionRecapProps {
  session: SpeakSession
  persona: Persona
  situation: Situation
  onRepeat: () => void
  onBack: () => void
}

export function SessionRecap({ session, persona, situation, onRepeat, onBack }: SessionRecapProps) {
  const { t: tr } = useI18n()
  const { transcript } = session

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const calculateScore = () => {
    if (!transcript || transcript.length === 0)
      return 0
    const userTurns = transcript.filter(turn => turn.role === 'user')
    return Math.min(100, 60 + userTurns.length * 10)
  }

  const score = calculateScore()
  const userTurns = transcript.filter(turn => turn.role === 'user').length

  return (
    <div className="flex flex-col h-full bg-background p-4 space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold">{tr('speak.sessionComplete')}</h2>
        <p className="text-muted-foreground">
          {situation.name}
          {' '}
          with
          {persona.name}
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{tr('speak.sessionRecap')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{formatDuration(session.durationSeconds)}</p>
              <p className="text-xs text-muted-foreground">{tr('speak.duration')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ring">{userTurns}</p>
              <p className="text-xs text-muted-foreground">{tr('speak.turns')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-success">{score}</p>
              <p className="text-xs text-muted-foreground">{tr('speak.score')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Turn timeline */}
      <div className="flex-1 overflow-y-auto space-y-3">
        <h3 className="font-semibold text-sm">{tr('speak.conversationPreview')}</h3>
        {transcript.map((turn, idx) => (
          <div
            key={idx}
            className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg ${
                turn.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">
                  {turn.role === 'user' ? tr('speak.you') : persona.name}
                </span>
              </div>
              <p className="text-sm">{turn.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          {tr('speak.backHome')}
        </Button>
        <Button className="flex-1" onClick={onRepeat}>
          {tr('speak.repeatSession')}
        </Button>
      </div>
    </div>
  )
}
