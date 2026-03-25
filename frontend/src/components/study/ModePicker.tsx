import type { LanguageCapabilities } from '@/lib/language-caps'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

export type ExerciseMode = 'cloze' | 'dictation' | 'romanization-recall' | 'pronunciation' | 'reconstruction' | 'writing' | 'translation' | 'mixed'

interface ModePickerProps {
  selected: ExerciseMode
  onSelect: (mode: ExerciseMode) => void
  count: number
  onCountChange: (n: number) => void
  writingReps: number
  onWritingRepsChange: (n: number) => void
  onStart: () => void
  lessonTitle: string
  loading?: boolean
  caps: LanguageCapabilities
}

export function ModePicker({ selected, onSelect, count, onCountChange, writingReps, onWritingRepsChange, onStart, lessonTitle, loading, caps }: ModePickerProps) {
  const { t } = useI18n()
  const MODES: { id: ExerciseMode, icon: string, name: string, desc: string }[] = [
    { id: 'mixed', icon: '✍️🎧🎤', name: t('study.mode.mixed'), desc: t('study.mode.mixed.desc') },
    { id: 'cloze', icon: '✍️', name: t('study.mode.cloze'), desc: t('study.mode.cloze.desc') },
    { id: 'dictation', icon: '🎧', name: t('study.mode.dictation'), desc: t('study.mode.dictation.desc') },
    ...(caps.romanizationSystem !== 'none'
      ? [{
          id: 'romanization-recall' as ExerciseMode,
          icon: '🔤',
          name: t('study.exercise.romanizationRecall.type').replace('{romanization}', caps.romanizationLabel),
          desc: t('study.mode.romanization.desc').replace('romanization', caps.romanizationLabel),
        }]
      : []),
    { id: 'pronunciation', icon: '🎤', name: t('study.mode.pronunciation'), desc: t('study.mode.pronunciation.desc') },
    { id: 'reconstruction', icon: '🔀', name: t('study.mode.reconstruction'), desc: t('study.mode.reconstruction.desc') },
    ...(caps.hasCharacterWriting ? [{ id: 'writing' as ExerciseMode, icon: '✏️', name: t('study.mode.writing'), desc: t('study.mode.writing.desc') }] : []),
    { id: 'translation', icon: '🌐', name: t('study.mode.translation'), desc: t('study.mode.translation.desc') },
  ]

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">{t('study.startSession')}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-8">{lessonTitle}</p>

      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">{t('study.exerciseType')}</p>

      {/* 3-column grid for individual modes */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(
              'py-10 px-2.5 rounded-md text-center border transition-all',
              selected === m.id
                ? 'bg-secondary border-border/60 shadow-sm'
                : 'border-border hover:bg-accent/60',
            )}
          >
            <span className="text-xl block mb-5">{m.icon}</span>
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-tight">{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Question count */}
      <div className="flex items-center justify-between px-4 py-3 rounded-md bg-secondary border border-border">
        <span className="text-sm text-muted-foreground">{t('study.questions')}</span>
        <div className="flex items-center gap-3">
          <button
            className="size-7 rounded-lg border border-border elegant-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.max(5, count - 1))}
          >
            −
          </button>
          <span className="text-base font-bold w-6 text-center">{count}</span>
          <button
            className="size-7 rounded-lg border border-border elegant-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.min(20, count + 1))}
          >
            +
          </button>
        </div>
      </div>

      {selected === 'writing' && (
        <div className="flex items-center justify-between px-4 py-3 rounded-md bg-secondary border border-border mt-2">
          <span className="text-sm text-muted-foreground">{t('study.writing.repsLabel')}</span>
          <div className="flex items-center gap-3">
            <button
              className="size-7 rounded-lg border border-border elegant-card text-sm hover:bg-accent transition-colors"
              onClick={() => onWritingRepsChange(Math.max(1, writingReps - 1))}
            >
              −
            </button>
            <span className="text-base font-bold w-6 text-center">{writingReps}</span>
            <button
              className="size-7 rounded-lg border border-border elegant-card text-sm hover:bg-accent transition-colors"
              onClick={() => onWritingRepsChange(Math.min(5, writingReps + 1))}
            >
              +
            </button>
          </div>
        </div>
      )}

      <Button className="w-full mt-8" onClick={onStart} disabled={loading}>
        <Sparkles className="size-4" />
        {loading ? t('study.generating') : t('study.startSessionButton')}
      </Button>
    </div>
  )
}
