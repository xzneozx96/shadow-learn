import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, SpeakSituation } from '@/types'
import { CheckCircle2, Clock, MessageSquare, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

interface SessionRecapProps {
  speakSession: SpeakSession
  persona: Persona
  situation: SpeakSituation
  onRepeat: () => void
  onBack: () => void
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function GrammarCorrectionCard({ feedback }: { feedback: GrammarFeedback }) {
  return (
    <div className="mt-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
        <CheckCircle2 size={12} />
        <span>Grammar feedback</span>
      </div>
      <div className="space-y-2">
        {feedback.issues.map(issue => (
          <div key={`${issue.original}::${issue.correction}::${issue.explanation}`} className="flex flex-col gap-1 p-2 rounded-md bg-background/60 border border-border/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground line-through decoration-amber-500/60">{issue.original}</span>
              <span className="text-amber-500 font-bold text-xs">→</span>
              <span className="text-xs text-foreground font-bold">{issue.correction}</span>
            </div>
            {issue.explanation && (
              <p className="text-[xs text-amber-200/80 leading-relaxed">
                {issue.explanation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SessionRecap({ speakSession, persona, situation, onRepeat, onBack }: SessionRecapProps) {
  const { t: tr } = useI18n()
  const { transcript } = speakSession
  const feedbacks = speakSession.feedbacks ?? {}

  const userTurns = transcript.filter(turn => turn.role === 'user').length

  return (
    <div className="flex flex-col h-[80vh] bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
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

        {/* Session context */}
        <div className="elegant-card p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground shrink-0">Situation</span>
            <span className="font-medium text-foreground text-right">{speakSession.situationTitle || situation.name}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground shrink-0">Level</span>
            <span className="font-medium text-foreground text-right">{speakSession.levelLabel || speakSession.proficiencyLevel}</span>
          </div>
          {speakSession.userGoal && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground shrink-0">Goal</span>
              <span className="text-foreground text-right leading-snug">{speakSession.userGoal}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="elegant-card p-4 flex flex-col items-center justify-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-primary/10 text-primary mb-1">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-lg font-bold leading-none">{formatDuration(speakSession.durationSeconds)}</p>
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{tr('speak.duration')}</p>
          </div>

          <div className="elegant-card p-4 flex flex-col items-center justify-center gap-2 text-center">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 mb-1">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-lg font-bold leading-none">{userTurns}</p>
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{tr('speak.turns')}</p>
          </div>
        </div>

        {/* Conversation preview with inline feedback */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1 h-3 rounded-full bg-primary" />
            <h3 className="font-bold text-sm text-foreground">{tr('speak.conversationPreview')}</h3>
          </div>
          <div className="space-y-3">
            {transcript.map((turn, i) => {
              const turnFeedback = turn.id ? feedbacks[turn.id] : undefined
              return (
                <div
                  key={turn.id ?? turn.timestamp ?? i}
                  className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[85%] flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
                        turn.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border text-foreground'
                      }`}
                    >
                      <p>{turn.content}</p>
                    </div>
                    {turnFeedback && <GrammarCorrectionCard feedback={turnFeedback} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-6 flex gap-3 border-t border-border">
        <Button size="lg" variant="outline" className="flex-1" onClick={onBack}>
          {tr('speak.backHome')}
        </Button>
        <Button className="flex-1" size="lg" onClick={onRepeat}>
          {tr('speak.repeatSession')}
        </Button>
      </div>
    </div>
  )
}
