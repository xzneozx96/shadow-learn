import type { SpeakSession } from '@/db'
import { CheckCircle2, Clock, Home, MessageSquare, RotateCcw, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  speakSession: SpeakSession
  persona: Persona
  situation: Situation
  onRepeat: () => void
  onBack: () => void
}

export function SessionRecap({ speakSession, persona, situation, onRepeat, onBack }: SessionRecapProps) {
  const { t: tr } = useI18n()
  const { transcript } = speakSession

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const calculateScore = () => {
    if (!transcript || transcript.length === 0)
      return 0
    const userTurns = transcript.filter(turn => turn.role === 'user')
    // Base score 60 + 10 per turn, capped at 100
    return Math.min(100, 60 + userTurns.length * 10)
  }

  const score = calculateScore()
  const userTurns = transcript.filter(turn => turn.role === 'user').length

  return (
    <div className="flex flex-col h-[80vh] bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* Success Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success border border-success/20 animate-in zoom-in-50 duration-500">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground">{tr('speak.sessionComplete')}</h2>
            <p className="text-muted-foreground max-w-[300px] text-sm leading-relaxed">
              {tr('speak.sessionSuccess', { situation: situation.name, persona: persona.name })}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="elegant-card p-4 flex flex-col items-center justify-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-primary/10 text-primary mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold leading-none">{formatDuration(speakSession.durationSeconds)}</p>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{tr('speak.duration')}</p>
            </div>
          </div>

          <div className="elegant-card p-4 flex flex-col items-center justify-center gap-2 text-center group">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 mb-3">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold leading-none">{userTurns}</p>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{tr('speak.turns')}</p>
            </div>
          </div>

          <div className="elegant-card p-4 flex flex-col items-center justify-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-success/10 text-success mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold leading-none">{score}</p>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{tr('speak.score')}</p>
            </div>
          </div>
        </div>

        {/* Conversation Preview */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1 h-3 rounded-full bg-primary" />
            <h3 className="font-bold text-sm text-foreground">{tr('speak.conversationPreview')}</h3>
          </div>

          <div className="space-y-3">
            {transcript.map((turn, i) => (
              <div
                key={turn.timestamp || i}
                className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'elegant-card rounded-tl-none'
                  }`}
                >
                  <p className="font-bold text-xs uppercase tracking-widest opacity-70 mb-1">
                    {turn.role === 'user' ? tr('speak.you') : persona.name}
                  </p>
                  <p>{turn.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 flex gap-3">
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          onClick={onBack}
        >
          {tr('speak.backHome')}
        </Button>
        <Button
          className="flex-1"
          size="lg"
          onClick={onRepeat}
        >
          {tr('speak.repeatSession')}
        </Button>
      </div>
    </div>
  )
}
