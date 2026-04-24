import type { SpeakSession } from '@/db'
import type { Persona } from '@/lib/constants'
import type { GrammarFeedback, SpeakSituation } from '@/types'
import { CheckCircle2, Clock, MessageSquare, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { getPersonaName } from '@/lib/constants'

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
  const { t: tr } = useI18n()

  if (!feedback.issues.length)
    return null

  return (
    <div className="mt-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
        <CheckCircle2 size={12} />
        <span>{tr('speak.feedbackPanel.grammarIntelligence')}</span>
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
  const { t: tr, locale } = useI18n()
  const { transcript } = speakSession
  const feedbacks = speakSession.feedbacks ?? {}

  const userTurns = transcript.filter(turn => turn.role === 'user').length

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success border border-success/20 animate-in zoom-in-50 duration-500">
            <Trophy className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-foreground">{tr('speak.sessionComplete')}</h2>
            <p className="text-muted-foreground max-w-90 leading-relaxed">
              {tr('speak.sessionSuccess', { situation: situation.title, persona: getPersonaName(persona, locale), level: speakSession.levelLabel || speakSession.proficiencyLevel })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="elegant-card p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-start min-w-0">
              <p className="text-xl font-bold leading-none mb-1.5">{formatDuration(speakSession.durationSeconds)}</p>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground/70">{tr('speak.duration')}</p>
            </div>
          </div>

          <div className="elegant-card p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-start min-w-0">
              <p className="text-xl font-bold leading-none mb-1.5">{userTurns}</p>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground/70">{tr('speak.turns')}</p>
            </div>
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
        <Button size="xl" variant="outline" className="flex-1" onClick={onBack}>
          {tr('speak.backHome')}
        </Button>
        <Button className="flex-1" size="xl" onClick={onRepeat}>
          {tr('speak.repeatSession')}
        </Button>
      </div>
    </div>
  )
}
