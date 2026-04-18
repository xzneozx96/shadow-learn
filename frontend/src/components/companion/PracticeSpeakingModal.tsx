import { ArrowLeftIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { ConversationScene } from '@/components/speak/ConversationScene'
import { PersonaPicker } from '@/components/speak/PersonaPicker'
import { SessionRecap } from '@/components/speak/SessionRecap'
import { SituationPicker } from '@/components/speak/SituationPicker'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

// TODO: Import from hooks/useSpeakSession.ts in Task 9
// import { useSpeakSession } from '@/hooks/useSpeakSession'

type SpeakStep = 'situation' | 'persona' | 'outline' | 'active' | 'recap'

interface PracticeSpeakingModalProps {
  onClose: () => void
}

export function PracticeSpeakingModal({ onClose }: PracticeSpeakingModalProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<SpeakStep>('situation')

  // Placeholder for useSpeakSession hook (will be implemented in Task 9)
  // Replace this with: const speakSession = useSpeakSession()
  const speakSession = {
    situation: null as string | null,
    persona: null as { name: string, level: string } | null,
    outline: null as string | null,
    messages: [] as { role: 'user' | 'ai', text: string }[],
    score: null as number | null,
    start: () => {},
    stop: () => {},
    setSituation: (_s: string) => {},
    setPersona: (_p: { name: string, level: string }) => {},
    setOutline: (_o: string) => {},
  }

  const stepList: SpeakStep[] = ['situation', 'persona', 'outline', 'active', 'recap']
  const currentIndex = stepList.indexOf(step)

  function handleSituationSelect(situation: string) {
    speakSession.setSituation(situation)
    setStep('persona')
  }

  function handlePersonaSelect(persona: { name: string, level: string }) {
    speakSession.setPersona(persona)
    setStep('outline')
  }

  function handleOutlineSubmit(outline: string) {
    speakSession.setOutline(outline)
    setStep('active')
    speakSession.start()
  }

  function handleFinish() {
    speakSession.stop()
    setStep('recap')
  }

  function handleDone() {
    onClose()
  }

  function handleBack() {
    if (step === 'persona') {
      setStep('situation')
    }
    else if (step === 'outline') {
      setStep('persona')
    }
    else if (step === 'active') {
      speakSession.stop()
      setStep('outline')
    }
    else if (step === 'recap') {
      setStep('active')
    }
  }

  const stepLabels: Record<SpeakStep, string> = {
    situation: t('speak.selectSituation'),
    persona: t('speak.selectPersona'),
    outline: t('speak.createOutline'),
    active: t('speak.practice'),
    recap: t('speak.sessionRecap'),
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="speak-modal-title"
    >
      <div className="relative flex h-[85vh] w-[90vw] max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              disabled={step === 'situation'}
              aria-label="Go back"
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
            <h2 id="speak-modal-title" className="text-lg font-semibold">
              {t('speak.title')}
            </h2>
            <span className="text-sm text-muted-foreground">
              {stepLabels[step]}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <XIcon className="size-4" />
          </Button>
        </div>

        {/* Progress indicator */}
        <div className="flex h-1 shrink-0 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{
              width: `${((currentIndex / (stepList.length - 1)) * 100).toFixed(1)}%`,
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'situation' && (
            <SituationPicker onSelect={handleSituationSelect} />
          )}
          {step === 'persona' && speakSession.situation && (
            <PersonaPicker
              situation={speakSession.situation}
              onSelect={handlePersonaSelect}
            />
          )}
          {step === 'outline' && speakSession.persona && (
            <div className="mx-auto max-w-lg space-y-4">
              <p className="text-center text-muted-foreground">
                {t('speak.outlineHint', { persona: speakSession.persona.name })}
              </p>
              <textarea
                className="w-full min-h-[200px] rounded-lg border border-input bg-background p-3 text-sm"
                placeholder={t('speak.outlinePlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    const target = e.target as HTMLTextAreaElement
                    handleOutlineSubmit(target.value)
                  }
                }}
              />
              <Button
                className="w-full"
                onClick={() => {
                  const textarea = document.querySelector('textarea')
                  if (textarea?.value)
                    handleOutlineSubmit(textarea.value)
                }}
              >
                {t('speak.startPractice')}
              </Button>
            </div>
          )}
          {step === 'active' && speakSession.outline && (
            <ConversationScene
              situation={speakSession.situation!}
              persona={speakSession.persona!}
              outline={speakSession.outline}
              onFinish={handleFinish}
            />
          )}
          {step === 'recap' && (
            <SessionRecap
              situation={speakSession.situation!}
              persona={speakSession.persona!}
              messages={speakSession.messages}
              score={speakSession.score}
              onDone={handleDone}
            />
          )}
        </div>
      </div>
    </div>
  )
}
