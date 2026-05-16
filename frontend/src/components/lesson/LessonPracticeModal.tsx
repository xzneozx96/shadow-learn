import type { VocabEntry } from '@/types'
import { BookOpen, Check, Ear, FileText, Mic, PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { ListeningSkillSession } from '@/components/study-queue/ListeningSkillSession'
import { ReadingSkillSession } from '@/components/study-queue/ReadingSkillSession'
import { SpeakingSkillSession } from '@/components/study-queue/SpeakingSkillSession'
import { VocabularySkillSession } from '@/components/study-queue/VocabularySkillSession'
import { WritingSkillSession } from '@/components/study-queue/WritingSkillSession'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'

type Skill = 'vocabulary' | 'listening' | 'reading' | 'writing' | 'speaking'

const SKILL_ORDER: Skill[] = ['vocabulary', 'listening', 'reading', 'writing', 'speaking']

interface LessonPracticeModalProps {
  open: boolean
  onClose: () => void
  entries: VocabEntry[]
  lessonTitle: string
}

export function LessonPracticeModal({ open, onClose, entries, lessonTitle }: LessonPracticeModalProps) {
  const { t } = useI18n()
  const today = todayISO()

  const [activeSkill, setActiveSkill] = useState<Skill | null>('vocabulary')
  const [visited, setVisited] = useState<Set<Skill>>(() => new Set())

  // Reset on open transition (setState-during-render pattern, mirrors DailyReviewModal).
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setActiveSkill('vocabulary')
      setVisited(new Set())
    }
  }

  const doneCount = visited.size
  const allDone = doneCount === SKILL_ORDER.length

  function handleComplete(justCompleted: Skill) {
    const newVisited = new Set([...visited, justCompleted])
    const next = SKILL_ORDER.find(s => !newVisited.has(s)) ?? null
    // flushSync ensures the active skill switch is observable to children
    // (the SkillSession components) before their `onComplete` callback returns,
    // so an immediately-following programmatic complete on the next skill
    // operates against the freshly mounted session.
    // eslint-disable-next-line react-dom/no-flush-sync
    flushSync(() => {
      setVisited(newVisited)
      setActiveSkill(next)
    })
  }

  const sessionProps = {
    entries,
    date: today,
    onBack: () => setActiveSkill(null),
    embedded: true as const,
  }

  const skills: Array<{ key: Skill, label: string, Icon: React.ElementType }> = [
    { key: 'vocabulary', label: t('queue.skill.vocabulary'), Icon: BookOpen },
    { key: 'listening', label: t('queue.skill.listening'), Icon: Ear },
    { key: 'reading', label: t('queue.skill.reading'), Icon: FileText },
    { key: 'writing', label: t('queue.skill.writing'), Icon: PenLine },
    { key: 'speaking', label: t('queue.skill.speaking'), Icon: Mic },
  ]

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()} disablePointerDismissal>
      <DialogContent className="flex h-[80vh] w-full max-w-5xl! gap-0 overflow-hidden rounded-xl p-0">
        <DialogTitle className="sr-only">{t('lesson.workbook.practiceTitle')}</DialogTitle>

        {/* Sidebar */}
        <div className="flex w-60 shrink-0 flex-col border-r">
          <div className="space-y-3 border-b px-4 py-5">
            <div>
              <div className="text-xl font-bold leading-none tracking-tight">
                {t('lesson.workbook.practiceTitle')}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{lessonTitle}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground/80">
                <span>{t('lesson.workbook.practiceProgress', { done: doneCount })}</span>
                <span className="tabular-nums">
                  {Math.round((doneCount / 5) * 100)}
                  %
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-border/50 bg-muted">
                <div
                  className="h-full bg-success/80 transition-all duration-700 ease-in-out"
                  style={{ width: `${(doneCount / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {skills.map(({ key, label, Icon }) => {
              const isActive = activeSkill === key
              const isDone = visited.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`skill-button-${key}`}
                  onClick={() => setActiveSkill(key)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    isActive ? 'border-r-2 border-primary bg-primary/10' : 'hover:bg-muted/30',
                    isDone && !isActive ? 'opacity-60' : '',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : isDone
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-card text-muted-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm font-semibold', isDone && !isActive ? 'text-muted-foreground line-through' : '')}>
                      {label}
                    </div>
                  </div>
                  {isDone && <Check className="size-3.5 shrink-0 text-emerald-500" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {allDone && activeSkill === null && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="size-8 text-emerald-500" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{t('lesson.workbook.practiceAllDone')}</div>
              </div>
            </div>
          )}
          {activeSkill === 'vocabulary' && (
            <VocabularySkillSession {...sessionProps} onComplete={() => handleComplete('vocabulary')} />
          )}
          {activeSkill === 'listening' && (
            <ListeningSkillSession {...sessionProps} onComplete={() => handleComplete('listening')} />
          )}
          {activeSkill === 'reading' && (
            <ReadingSkillSession {...sessionProps} onComplete={() => handleComplete('reading')} />
          )}
          {activeSkill === 'writing' && (
            <WritingSkillSession {...sessionProps} onComplete={() => handleComplete('writing')} />
          )}
          {activeSkill === 'speaking' && (
            <SpeakingSkillSession {...sessionProps} onComplete={() => handleComplete('speaking')} />
          )}
          {!activeSkill && !allDone && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div className="text-sm text-muted-foreground">{t('queue.review.selectSkill')}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
