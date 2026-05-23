import type { StudyQueueState } from '@/features/study/application/useStudyQueue'
import { AlertTriangle, ArrowLeft, BookOpen, Check, Ear, FileText, Mic, PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { useI18n } from '@/contexts/I18nContext'
import { todayISO } from '@/shared/lib/date'
import { getSkillProgress, isReadingDone } from '@/shared/lib/skillSessionProgress'
import { cn } from '@/shared/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { ListeningSkillSession } from './ListeningSkillSession'
import { ReadingSkillSession } from './ReadingSkillSession'
import { SpeakingSkillSession } from './SpeakingSkillSession'
import { VocabularySkillSession } from './VocabularySkillSession'
import { WritingSkillSession } from './WritingSkillSession'

type Skill = 'vocabulary' | 'listening' | 'speaking' | 'reading' | 'writing'
type SkillStatus = 'pending' | 'partial' | 'alert' | 'done'

const SKILL_ORDER: Skill[] = ['vocabulary', 'listening', 'reading', 'writing', 'speaking']

interface Props {
  open: boolean
  onClose: () => void
  queue: StudyQueueState
  initialSkill?: Skill | null
}

export function DailyReviewModal({ open, onClose, queue, initialSkill }: Props) {
  const { t } = useI18n()
  const today = todayISO()
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [sessionVisited, setSessionVisited] = useState(() => new Set<Skill>())
  const [, setProgressTick] = useState(0)
  const onProgress = () => setProgressTick(t => t + 1)

  const skillDone: Record<Skill, boolean> = {
    vocabulary: queue.vocabularyDone,
    listening: queue.listeningDone,
    speaking: queue.speakingDone,
    reading: queue.readingDone,
    writing: queue.writingDone,
  }

  const total = queue.dailyEntries.length
  const entryIds = new Set(queue.dailyEntries.map(e => e.id))

  function getSkillProgressForEntries(key: Skill): number {
    if (key === 'reading')
      return 0
    const completed = getSkillProgress(key as Exclude<Skill, 'reading'>, today)
    let count = 0
    for (const id of completed) {
      if (entryIds.has(id))
        count++
    }
    return count
  }

  function getSkillStatus(key: Skill): SkillStatus {
    const persisted = skillDone[key]
    const visited = sessionVisited.has(key)

    if (key === 'reading') {
      if (persisted)
        return 'done'
      if (visited)
        return 'alert'
      return 'pending'
    }

    const progress = getSkillProgressForEntries(key)
    if (persisted)
      return 'done'
    if (visited)
      return progress >= total ? 'done' : 'alert'
    if (progress > 0)
      return 'partial'
    return 'pending'
  }

  const doneCount = SKILL_ORDER.filter(s => getSkillStatus(s) === 'done').length

  function firstIncomplete(): Skill | null {
    return SKILL_ORDER.find(s => !skillDone[s] && !sessionVisited.has(s)) ?? null
  }

  // Reset session state when modal opens (setState-during-render)
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setSessionVisited(new Set())
      setActiveSkill(initialSkill ?? firstIncomplete())
    }
  }

  function handleSkillComplete(justCompleted: Skill) {
    void queue.refresh()
    const newVisited = new Set([...sessionVisited, justCompleted])
    setSessionVisited(newVisited)
    const doneNow = new Set([...SKILL_ORDER.filter(s => skillDone[s]), ...newVisited])
    const next = SKILL_ORDER.find(s => !doneNow.has(s)) ?? null
    setActiveSkill(next)
  }

  const skills = [
    { key: 'vocabulary' as const, label: t('queue.skill.vocabulary'), Icon: BookOpen },
    { key: 'listening' as const, label: t('queue.skill.listening'), Icon: Ear },
    { key: 'reading' as const, label: t('queue.skill.reading'), Icon: FileText },
    { key: 'writing' as const, label: t('queue.skill.writing'), Icon: PenLine },
    { key: 'speaking' as const, label: t('queue.skill.speaking'), Icon: Mic },
  ]

  const sessionProps = {
    entries: queue.dailyEntries,
    date: today,
    onBack: () => setActiveSkill(null),
    embedded: true as const,
  }

  const allDone = (queue.dailyReviewDone || sessionVisited.size === SKILL_ORDER.length) && activeSkill === null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()} disablePointerDismissal>
      <DialogContent className="p-0 gap-0 overflow-hidden flex w-full max-w-5xl! rounded-xl h-[80vh]">
        <DialogTitle className="sr-only">Daily Review</DialogTitle>

        {/* Sidebar */}
        <div className="w-60 shrink-0 border-r flex flex-col">
          <div className="px-4 py-6 border-b space-y-4">
            <div className="text-xl font-bold tracking-tight leading-none">{t('queue.review.title')}</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground/80">
                <span>{t('queue.review.progress', { done: doneCount, total: 5 })}</span>
                <span className="tabular-nums">
                  {Math.round((doneCount / 5) * 100)}
                  %
                </span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden border border-border/50">
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

              const progressCount = key === 'reading'
                ? (isReadingDone(today) ? 1 : 0)
                : getSkillProgressForEntries(key)

              let countLabel: string
              if (key === 'reading') {
                if (isDone)
                  countLabel = t('queue.review.status.done')
                else if (isAlert)
                  countLabel = t('queue.review.status.skipped')
                else if (isPartial)
                  countLabel = t('queue.review.status.inProgress')
                else
                  countLabel = t('queue.review.status.pending')
              }
              else {
                countLabel = `${progressCount} / ${total}`
                if (isAlert)
                  countLabel += t('queue.review.skippedSuffix')
              }

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
                ? <Check className="size-4 text-emerald-500 shrink-0" />
                : isAlert
                  ? <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                  : isPartial
                    ? <span className="size-4 rounded-full border border-primary/60 bg-primary/10 shrink-0 flex items-center justify-center"><span className="size-1.5 rounded-full bg-primary/80" /></span>
                    : null

              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    isActive
                      ? 'bg-primary/10 border-r-2 border-primary'
                      : 'hover:bg-muted/30',
                    (isDone || isAlert) && !isActive ? 'opacity-60' : '',
                  )}
                  onClick={() => setActiveSkill(key)}
                >
                  <div className={cn('size-8 rounded-full flex items-center justify-center shrink-0', iconBg)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-base font-semibold',
                      isDone && !isActive ? 'line-through text-muted-foreground' : '',
                      isAlert && !isActive ? 'text-amber-500/80' : '',
                    )}
                    >
                      {label}
                    </div>
                    <div className={cn(
                      'text-xs',
                      isAlert ? 'text-amber-500/60' : 'text-muted-foreground/70',
                    )}
                    >
                      {countLabel}
                    </div>
                  </div>
                  {TrailingIcon}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {allDone && (
            <AllDoneView skills={skills} skillDone={skillDone} t={t} />
          )}
          {activeSkill === 'vocabulary' && (
            <VocabularySkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('vocabulary')}
              onProgress={onProgress}
            />
          )}
          {activeSkill === 'listening' && (
            <ListeningSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('listening')}
              onProgress={onProgress}
            />
          )}
          {activeSkill === 'speaking' && (
            <SpeakingSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('speaking')}
              onProgress={onProgress}
            />
          )}
          {activeSkill === 'reading' && (
            <ReadingSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('reading')}
            />
          )}
          {activeSkill === 'writing' && (
            <WritingSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('writing')}
              onProgress={onProgress}
            />
          )}
          {!activeSkill && !allDone && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <div className="text-base font-semibold">{t('queue.review.selectSkill')}</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <ArrowLeft className="size-4" />
                  {t('queue.review.selectSkillHint')}
                </div>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface AllDoneViewProps {
  skills: Array<{ key: Skill, label: string, Icon: React.ElementType }>
  skillDone: Record<Skill, boolean>
  t: ReturnType<typeof useI18n>['t']
}

function AllDoneView({ skills, skillDone, t }: AllDoneViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <Check className="size-8 text-emerald-500" />
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold">{t('queue.review.allDone')}</div>
        <div className="text-sm text-muted-foreground mt-1">{t('queue.review.allDoneSubtitle')}</div>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {skills.map(({ key, label, Icon }) => (
          <div key={key} className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5 bg-card">
            <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Icon className="size-4" />
            </div>
            <span className="flex-1 text-sm font-medium">{label}</span>
            {skillDone[key] && <Check className="size-4 text-emerald-500 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}
