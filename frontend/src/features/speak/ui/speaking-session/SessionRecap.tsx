import type { SpeakSession } from '@/db'
import type { Persona } from '@/shared/lib/constants'
import type { TranslationKey } from '@/shared/lib/i18n'
import type { SessionEvaluation, SpeakSituation } from '@/shared/types'
import { AlertCircle, CheckCircle2, Clock, MessageSquare, TrendingUp, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useI18n } from '@/app/providers/I18nContext'
import { GrammarCorrectionCard, TranslationInline } from '@/features/agent/ui/agents-ui/agent-chat-transcript'
import { useCountUp } from '@/shared/hooks/useCountUp'
import { getPersonaName } from '@/shared/lib/constants'
import { Button } from '@/shared/ui/button'

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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/80" />
    </div>
  )
}

function EvaluationSection({ evaluation, t }: { evaluation: SessionEvaluation, t: (k: TranslationKey) => string }) {
  return (
    <div className="space-y-5">
      {evaluation.strengths.length > 0 && (
        <div className="space-y-5">
          <SectionDivider label={t('speak.eval.strengths')} />
          <ul className="space-y-2">
            {evaluation.strengths.map(s => (
              <li key={s} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                <span className="text-sm text-foreground/80 leading-snug">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.areas_to_improve.length > 0 && (
        <div className="space-y-3">
          <SectionDivider label={t('speak.eval.areasToImprove')} />
          <ul className="space-y-2">
            {evaluation.areas_to_improve.map(a => (
              <li key={a} className="flex items-start gap-2.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400/80 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground/80 leading-snug">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(evaluation.vocabulary_mastered.length > 0 || evaluation.vocabulary_to_practice.length > 0) && (
        <div className="space-y-4">
          {evaluation.vocabulary_mastered.length > 0 && (
            <div className="space-y-2.5">
              <SectionDivider label={t('speak.eval.vocabMastered')} />
              <div className="flex flex-wrap gap-1.5">
                {evaluation.vocabulary_mastered.map(w => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-success/10 text-success text-xs font-bold tracking-wide"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
          {evaluation.vocabulary_to_practice.length > 0 && (
            <div className="space-y-2.5">
              <SectionDivider label={t('speak.eval.vocabToPractice')} />
              <div className="flex flex-wrap gap-1.5">
                {evaluation.vocabulary_to_practice.map(w => (
                  <span
                    key={w}
                    className="px-3 py-1 rounded-md bg-primary/10 text-primary/80 text-xs font-bold tracking-wide"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {evaluation.suggestions.length > 0 && (
        <div className="space-y-3">
          <SectionDivider label={t('speak.eval.suggestions')} />
          <ul className="space-y-2">
            {evaluation.suggestions.map((s, i) => (
              <li key={s} className="flex items-start gap-3">
                <span className="text-xs font-bold text-primary tabular-nums mt-0.5 w-4 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm text-foreground/80 leading-snug">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function SessionRecap({ speakSession, persona, situation, onRepeat, onBack }: SessionRecapProps) {
  const { t: tr, locale } = useI18n()
  const { transcript } = speakSession
  const feedbacks = speakSession.feedbacks ?? {}

  const userTurns = transcript.filter(turn => turn.role === 'user').length
  const animatedTurns = useCountUp(userTurns)

  return (
    <div className="flex flex-1 min-h-0 gap-0">
      {/* Left: Overview */}
      <div className="flex-1 overflow-y-auto custom-scrollbar border-r border-border">
        {/* Hero header */}
        <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-success/20 blur-xl scale-150" />
            <div className="relative w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success animate-in zoom-in-50 duration-500">
              <Trophy className="w-8 h-8" strokeWidth={1.5} />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">
            {tr('speak.sessionComplete')}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-80">
            {tr('speak.sessionSuccess', {
              situation: situation.title,
              persona: getPersonaName(persona, locale),
              level: speakSession.levelLabel || speakSession.proficiencyLevel,
            })}
          </p>
        </div>

        {/* Stat strip */}
        <div className="mx-6 mb-6 rounded-xl bg-card border border-border/60 flex divide-x divide-border/60">
          <div className="flex-1 px-5 py-4 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {tr('speak.duration')}
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground leading-none tracking-tight">
              {formatDuration(speakSession.durationSeconds)}
            </p>
          </div>

          <div className="flex-1 px-5 py-4 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400/60" />
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {tr('speak.turns')}
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground leading-none tracking-tight">
              {animatedTurns}
            </p>
          </div>
        </div>

        {/* Evaluation */}
        {speakSession.evaluation && (
          <div className="px-6 pb-8">
            <EvaluationSection evaluation={speakSession.evaluation} t={tr} />
          </div>
        )}
      </div>

      {/* Right: Conversation History + Action Buttons */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          {transcript.map((turn, i) => {
            const turnFeedback = turn.id ? feedbacks[turn.id] : undefined
            const isUser = turn.role === 'user'
            return (
              <motion.div
                key={turn.id ?? turn.timestamp ?? i}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0, x: isUser ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                {isUser
                  ? (
                      <div className="flex flex-col items-end max-w-[85%]">
                        <div className="flex items-center gap-1.5">
                          {turnFeedback && (
                            turnFeedback.issues.length > 0
                              ? <AlertCircle className="size-5 text-amber-500 shrink-0" />
                              : <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                          )}
                          <div className="rounded-lg px-3 py-2 text-sm leading-relaxed bg-primary text-primary-foreground">
                            <p className="wrap-break-word">{turn.content}</p>
                          </div>
                        </div>
                        {turnFeedback && <GrammarCorrectionCard feedback={turnFeedback} />}
                      </div>
                    )
                  : (
                      <div className="max-w-[85%]">
                        <div className="rounded-lg px-3 py-2 text-sm leading-relaxed bg-card border text-foreground space-y-2">
                          <p className="wrap-break-word">{turn.content}</p>
                          {(turn.translation || turn.romanization) && (
                            <TranslationInline
                              translation={turn.translation}
                              romanization={turn.romanization}
                            />
                          )}
                        </div>
                      </div>
                    )}
              </motion.div>
            )
          })}
        </div>

        <div className="shrink-0 p-6 pt-4 flex gap-3 border-t border-border">
          <Button size="lg" variant="outline" className="flex-1" onClick={onBack}>
            {tr('speak.backHome')}
          </Button>
          <Button className="flex-1" size="lg" onClick={onRepeat}>
            {tr('speak.repeatSession')}
          </Button>
        </div>
      </div>
    </div>
  )
}
