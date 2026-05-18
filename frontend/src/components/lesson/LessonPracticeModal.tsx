import type { SkillName } from '@/lib/skillSessionProgress'
import type { VocabEntry } from '@/types'
import { AlertTriangle, BookOpen, Check, Ear, FileText, Mic, PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ListeningSkillSession } from '@/components/study-queue/ListeningSkillSession'
import { ReadingSkillSession } from '@/components/study-queue/ReadingSkillSession'
import { SpeakingSkillSession } from '@/components/study-queue/SpeakingSkillSession'
import { VocabularySkillSession } from '@/components/study-queue/VocabularySkillSession'
import { WritingSkillSession } from '@/components/study-queue/WritingSkillSession'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { getSkillProgress, isReadingDone } from '@/lib/skillSessionProgress'
import { cn } from '@/lib/utils'

type Skill = 'vocabulary' | 'listening' | 'reading' | 'writing' | 'speaking'
type SkillStatus = 'pending' | 'partial' | 'alert' | 'done'

const SKILL_ORDER: Skill[] = ['vocabulary', 'listening', 'reading', 'writing', 'speaking']

interface LessonPracticeModalProps {
  open: boolean
  onClose: () => void
  entries: VocabEntry[]
  lessonTitle: string
}

export function LessonPracticeModal({ open, onClose, entries, lessonTitle }: LessonPracticeModalProps) {
  const { t } = useI18n()

  const [activeSkill, setActiveSkill] = useState<Skill | null>('vocabulary')
  const [visited, setVisited] = useState<Set<Skill>>(() => new Set())
  const [, setProgressTick] = useState(0)
  const total = entries.length
  const lessonId = entries[0]?.sourceLessonId ?? ''
  const [sessionDate, setSessionDate] = useState<string>(() => `lesson-${lessonId}-${crypto.randomUUID()}`)

  function cleanupSessionStorage(scope: string) {
    const prefix = `skill-session-${scope}-`
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix))
        toRemove.push(key)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  }

  // Reset on open transition (setState-during-render pattern, mirrors DailyReviewModal).
  // Each open generates a fresh sessionDate so progress is isolated per session.
  // On close, we clean up the prior session's localStorage keys.
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setActiveSkill('vocabulary')
      setVisited(new Set())
      setSessionDate(`lesson-${lessonId}-${crypto.randomUUID()}`)
    }
    else {
      cleanupSessionStorage(sessionDate)
    }
  }

  const entryIds = new Set(entries.map(e => e.id))

  function getSkillProgressForEntries(key: SkillName): number {
    const completed = getSkillProgress(key, sessionDate)
    let count = 0
    for (const id of completed) {
      if (entryIds.has(id))
        count++
    }
    return count
  }

  function getSkillStatus(key: Skill): SkillStatus {
    const wasVisited = visited.has(key)
    if (key === 'reading') {
      if (wasVisited && isReadingDone(sessionDate))
        return 'done'
      if (wasVisited)
        return 'alert'
      return 'pending'
    }
    const progress = getSkillProgressForEntries(key as SkillName)
    if (wasVisited)
      return progress >= total && total > 0 ? 'done' : 'alert'
    if (progress > 0)
      return 'partial'
    return 'pending'
  }

  const doneCount = SKILL_ORDER.filter(s => getSkillStatus(s) === 'done').length

  // allDone requires every skill to be fully completed (status 'done').
  // Skipped/partial skills (status 'alert') keep the modal open so the user
  // can revisit them.
  const allDone = doneCount === SKILL_ORDER.length

  function handleComplete(justCompleted: Skill) {
    setVisited((prev) => {
      const next = new Set([...prev, justCompleted])
      setActiveSkill(SKILL_ORDER.find(s => !next.has(s)) ?? null)
      return next
    })
  }

  const sessionProps = {
    entries,
    date: sessionDate,
    onBack: () => setActiveSkill(null),
    onProgress: () => setProgressTick(t => t + 1),
    embedded: true as const,
  }

  function getSkillCountLabel(key: Skill): string {
    if (key === 'reading')
      return ''
    const progress = getSkillProgressForEntries(key as SkillName)
    return `${progress} / ${total}`
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
          <div className="space-y-4 border-b px-4 py-5">
            <div>
              <div className="text-xl font-bold leading-none tracking-tight">
                {t('lesson.workbook.practiceTitle')}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{lessonTitle}</div>
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
              const status = getSkillStatus(key)
              const isActive = activeSkill === key
              const isDone = status === 'done'
              const isAlert = status === 'alert'
              const isPartial = status === 'partial'

              const iconBg = isActive
                ? 'bg-primary/20 text-primary'
                : isDone
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : isAlert
                    ? 'bg-amber-500/10 text-amber-500'
                    : isPartial
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'bg-card text-muted-foreground'

              const TrailingIcon = isDone
                ? <Check className="size-4 shrink-0 text-emerald-500" />
                : isAlert
                  ? <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  : isPartial
                    ? <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/10"><span className="size-1.5 rounded-full bg-primary/80" /></span>
                    : null

              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`skill-button-${key}`}
                  onClick={() => setActiveSkill(key)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    isActive ? 'border-r-2 border-primary bg-primary/10' : 'hover:bg-muted/30',
                    (isDone || isAlert) && !isActive ? 'opacity-60' : '',
                  )}
                >
                  <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', iconBg)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn(
                      'text-sm font-semibold',
                      isDone && !isActive ? 'text-muted-foreground line-through' : '',
                      isAlert && !isActive ? 'text-amber-500/80' : '',
                    )}
                    >
                      {label}
                    </div>
                    {getSkillCountLabel(key) && (
                      <div className={cn('mt-0.5 text-xs', isAlert ? 'text-amber-500/60' : 'text-muted-foreground/70')}>
                        {getSkillCountLabel(key)}
                      </div>
                    )}
                  </div>
                  {TrailingIcon}
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
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('lesson.workbook.practiceAllDoneSubtitle')}
                </div>
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
