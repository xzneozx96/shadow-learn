import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { AlertTriangle, BookOpen, Check, ChevronRight, Ear, FileText, Mic, PenLine } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { getReadingPassage, getSkillProgress, isReadingDone } from '@/lib/skillSessionProgress'
import { cn } from '@/lib/utils'
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
  const today = new Date().toISOString().split('T')[0]
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null)
  const [sessionVisited, setSessionVisited] = useState(new Set<Skill>())

  const skillDone: Record<Skill, boolean> = {
    vocabulary: queue.vocabularyDone,
    listening: queue.listeningDone,
    speaking: queue.speakingDone,
    reading: queue.readingDone,
    writing: queue.writingDone,
  }

  const total = queue.dailyEntries.length

  function getSkillStatus(key: Skill): SkillStatus {
    const persisted = skillDone[key]
    const visited = sessionVisited.has(key)

    if (key === 'reading') {
      if (persisted)
        return 'done'
      if (visited)
        return 'alert'
      if (getReadingPassage(today))
        return 'partial'
      return 'pending'
    }

    const progress = getSkillProgress(key, today).length
    if (persisted)
      return 'done'
    if (visited)
      return progress >= total ? 'done' : 'alert'
    if (progress > 0)
      return 'partial'
    return 'pending'
  }

  const doneCount = SKILL_ORDER.filter((s) => {
    const st = getSkillStatus(s)
    return st === 'done' || st === 'alert'
  }).length

  function firstIncomplete(): Skill | null {
    return SKILL_ORDER.find(s => !skillDone[s] && !sessionVisited.has(s)) ?? null
  }

  useEffect(() => {
    if (open) {
      setSessionVisited(new Set())
      setActiveSkill(initialSkill ?? firstIncomplete())
    }
  }, [open])

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
      <DialogContent className="p-0 gap-0 overflow-hidden flex w-full max-w-5xl! rounded-xl h-[90vh]">
        <DialogTitle className="sr-only">Daily Review</DialogTitle>

        {/* Sidebar */}
        <div className="w-60 shrink-0 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border/30 flex items-center gap-3">
            <RingProgress done={doneCount} total={5} />
            <div>
              <div className="text-sm font-semibold">{t('queue.review.title')}</div>
              <div className="text-xs text-muted-foreground">
                {t('queue.review.progress', { done: doneCount, total: 5 })}
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
                : getSkillProgress(key, today).length

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
                ? <Check className="size-3.5 text-emerald-500 shrink-0" />
                : isAlert
                  ? <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                  : isPartial
                    ? <ChevronRight className="size-3.5 text-blue-400 shrink-0" />
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
                    <Icon className="size-3.5" />
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
            />
          )}
          {activeSkill === 'listening' && (
            <ListeningSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('listening')}
            />
          )}
          {activeSkill === 'speaking' && (
            <SpeakingSkillSession
              {...sessionProps}
              onComplete={() => handleSkillComplete('speaking')}
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
            />
          )}
          {!activeSkill && !allDone && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              {t('queue.review.selectSkill')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RingProgress({ done, total }: { done: number, total: number }) {
  const r = 16
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  const dash = pct * circ

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-primary"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor" className="text-foreground">
        {Math.round(pct * 100)}
        %
      </text>
    </svg>
  )
}

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
              <Icon className="size-3.5" />
            </div>
            <span className="flex-1 text-sm font-medium">{label}</span>
            {skillDone[key] && <Check className="size-4 text-emerald-500 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}
