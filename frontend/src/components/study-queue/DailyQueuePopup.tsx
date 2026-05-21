// frontend/src/components/study-queue/DailyQueuePopup.tsx
import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { ArrowRight, BookOpen, Check, ChevronDown, Ear, FileText, Mic, PenLine, Plus, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDailyReview } from '@/contexts/DailyReviewContext'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'

type ActivePanel = null | 'vocabulary' | 'listening' | 'speaking' | 'reading' | 'writing'

interface Props {
  queue: StudyQueueState
  onClose: () => void
}

export function DailyQueuePopup({ queue, onClose }: Props) {
  const { t } = useI18n()
  const { lessons } = useLessons()
  const navigate = useNavigate()
  const { openReviewModal } = useDailyReview()
  const [expanded, setExpanded] = useState(true)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState('')

  const today = todayISO()
  const mostRecentLesson = [...lessons]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .find(l => !l.status || l.status === 'complete')

  const hasAnyContent = queue.hasDailyReview || !!mostRecentLesson || queue.customTasks.length > 0

  function openSkill(skill: ActivePanel) {
    openReviewModal(skill ?? undefined)
  }

  function handleStartShadowing() {
    if (!mostRecentLesson)
      return
    onClose()
    navigate(`/lesson/${mostRecentLesson.id}?shadowing=true`)
  }

  async function handleAddTask() {
    const title = newTaskTitle.trim()
    if (!title)
      return
    await queue.addCustomTask(title)
    setNewTaskTitle('')
    setAddingTask(false)
  }

  const skills = [
    { key: 'vocabulary' as const, label: t('queue.skill.vocabulary'), done: queue.vocabularyDone, icon: BookOpen },
    { key: 'listening' as const, label: t('queue.skill.listening'), done: queue.listeningDone, icon: Ear },
    { key: 'reading' as const, label: t('queue.skill.reading'), done: queue.readingDone, icon: FileText },
    { key: 'writing' as const, label: t('queue.skill.writing'), done: queue.writingDone, icon: PenLine },
    { key: 'speaking' as const, label: t('queue.skill.speaking'), done: queue.speakingDone, icon: Mic },
  ]

  return (
    <div className="relative w-[340px] rounded-2xl overflow-hidden bg-black/20 backdrop-blur-2xl border border-white/10 flex flex-col bg-linear-to-br from-zinc-800/30 to-zinc-800/50 shadow-xl">

      {editingTaskId !== null && (
        <div
          className="absolute inset-0 z-10"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const title = editingTaskTitle.trim()
            if (title)
              void queue.updateCustomTask(editingTaskId, title)
            setEditingTaskId(null)
          }}
        />
      )}

      {/* Header */}
      <div className="p-3 border-b border-white/10">
        {queue.allDoneToday
          ? (
              <>
                <div className="text-lg font-bold text-emerald-400">{t('queue.allDone')}</div>
                <div className="text-sm text-muted-foreground mt-0.5">{t('queue.allDoneSubtitle')}</div>
              </>
            )
          : (
              <>
                <div className="text-lg font-bold">{t('queue.title')}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {queue.loading
                    ? null
                    : t(queue.incompleteCount !== 1 ? 'queue.itemsLeft_plural' : 'queue.itemsLeft', { count: queue.incompleteCount })}
                </div>
              </>
            )}
      </div>

      {!hasAnyContent && !queue.loading
        && (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            {t('queue.empty')}
          </div>
        )}

      {hasAnyContent && (
        <div className="py-1">

          {/* Daily Review (expandable parent) */}
          {queue.hasDailyReview && (
            <>
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onClick={() => setExpanded(e => !e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(ex => !ex) } }}
              >
                <CircleIndicator
                  done={queue.dailyReviewDone}
                  partial={!queue.dailyReviewDone && skills.some(s => s.done)}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-sm font-semibold',
                    queue.dailyReviewDone ? 'line-through text-muted-foreground' : '',
                  )}
                  >
                    {t('queue.dailyReview')}
                    {' '}
                    {!queue.dailyReviewDone && queue.dailyEntries.length > 0 && (
                      <span className="text-amber-400">
                        {t('queue.wordsDue', { count: queue.dailyEntries.length })}
                      </span>
                    )}
                  </div>
                </div>
                <motion.span
                  animate={{ rotate: expanded ? 0 : -90 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="flex items-center"
                >
                  <ChevronDown className="size-4.5 text-muted-foreground/50" />
                </motion.span>
              </div>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="relative pl-4 mb-1">
                      <div className="absolute left-6 top-0 bottom-0 w-px bg-primary/20" />
                      {skills.map(skill => (
                        <SkillRow
                          key={skill.key}
                          label={skill.label}
                          done={skill.done}
                          Icon={skill.icon}
                          onStart={() => openSkill(skill.key)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Shadowing */}
          {mostRecentLesson && (
            <div
              role="button"
              tabIndex={0}
              className="w-full flex items-center gap-3 px-4 py-2.5 pr-3 hover:bg-muted/30 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={handleStartShadowing}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartShadowing() } }}
            >
              <CircleIndicator done={queue.shadowingDone} partial={false} />
              <span className={cn(
                'flex-1 text-sm font-semibold',
                queue.shadowingDone ? 'line-through text-muted-foreground' : '',
              )}
              >
                {t('queue.shadowing')}
              </span>
              {queue.shadowingDone
                ? (
                    <Button size="icon-xs" variant="ghost" className="text-emerald-500 pointer-events-none">
                      <Check className="size-3" />
                    </Button>
                  )
                : <StartButton />}
            </div>
          )}

          {/* Custom tasks */}
          {queue.customTasks.map(task => (
            <div key={task.id} className={cn('flex items-center gap-3 px-4 py-2.5', editingTaskId === task.id && 'relative z-20')}>
              <button
                type="button"
                className={cn(
                  'size-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                  task.completedDate === today
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-primary/50 hover:border-primary',
                )}
                onClick={() => void queue.toggleCustomTask(task.id)}
              >
                {task.completedDate === today && <Check className="size-2.5" />}
              </button>
              {editingTaskId === task.id
                ? (
                    <Input
                      className="h-8"
                      value={editingTaskTitle}
                      autoFocus
                      onChange={e => setEditingTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (!editingTaskTitle.trim())
                            return
                          e.currentTarget.blur()
                        }
                        if (e.key === 'Escape')
                          setEditingTaskId(null)
                      }}
                      onBlur={() => {
                        const title = editingTaskTitle.trim()
                        if (title) {
                          void queue.updateCustomTask(task.id, title)
                          setEditingTaskId(null)
                        }
                      }}
                    />
                  )
                : (
                    <span
                      className={cn(
                        'flex-1 text-sm font-semibold cursor-text',
                        task.completedDate === today ? 'line-through text-muted-foreground' : '',
                      )}
                      onClick={() => { setEditingTaskId(task.id); setEditingTaskTitle(task.title) }}
                    >
                      {task.title}
                    </span>
                  )}
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-destructive"
                onClick={() => void queue.removeCustomTask(task.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add task */}
      <div className="py-1">
        {addingTask
          ? (
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="size-4 rounded-full border-2 border-dashed border-primary/40 shrink-0" />
                <Input
                  className="h-8"
                  placeholder={t('queue.addTaskPlaceholder')}
                  value={newTaskTitle}
                  autoFocus
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      void handleAddTask()
                    if (e.key === 'Escape') {
                      setAddingTask(false)
                      setNewTaskTitle('')
                    }
                  }}
                />
                <div className="flex gap-1">
                  <Button size="icon-xs" variant="default" type="button" className="rounded-full" onClick={() => void handleAddTask()}>
                    <Check className="size-3" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" type="button" className="rounded-full" onClick={() => { setAddingTask(false); setNewTaskTitle('') }}>
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            )
          : (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group"
                onClick={() => setAddingTask(true)}
              >
                <Plus className="size-4 text-muted-foreground/50 group-hover:text-primary/60 transition-colors" />
                <span className="text-sm font-semibold text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                  {t('queue.addTask')}
                </span>
              </button>
            )}
      </div>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CircleIndicator({ done, partial }: { done: boolean, partial: boolean }) {
  return (
    <div className={cn(
      'size-4 rounded-full border-2 shrink-0 flex items-center justify-center',
      done
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : partial
          ? 'border-primary bg-primary/10'
          : 'border-primary/50 hover:border-primary',
    )}
    >
      {done && <Check className="size-2.5" />}
      {partial && !done && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
    </div>
  )
}

interface SkillRowProps {
  label: string
  done: boolean
  Icon: React.ElementType
  onStart: () => void
}

function SkillRow({ label, done, onStart }: SkillRowProps) {
  return (
    <div
      role="button"
      tabIndex={done ? -1 : 0}
      className="relative flex items-center gap-3 pl-6 pr-3 py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors cursor-pointer"
      onClick={done ? undefined : onStart}
      onKeyDown={done ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart() } }}
    >
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm text-muted-foreground font-semibold', done ? 'line-through text-muted-foreground/50' : '')}>
          {label}
        </div>
      </div>
      {done
        ? (
            <Button size="icon-xs" variant="ghost" className="text-emerald-500 pointer-events-none">
              <Check className="size-3" />
            </Button>
          )
        : <StartButton onClick={onStart} />}
    </div>
  )
}

function StartButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      size="icon-xs"
      variant="outline"
      className="rounded-full"
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <ArrowRight className="text-primary size-3 -rotate-45" />
    </Button>
  )
}
