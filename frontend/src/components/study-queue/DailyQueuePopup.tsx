// frontend/src/components/study-queue/DailyQueuePopup.tsx
import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { BookOpen, Check, ChevronDown, Ear, FileText, Mic, PenLine, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
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
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [expanded, setExpanded] = useState(true)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const mostRecentLesson = [...lessons]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .find(l => !l.status || l.status === 'complete')

  const hasAnyContent = queue.hasDailyReview || !!mostRecentLesson || queue.customTasks.length > 0

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
    {
      key: 'vocabulary' as const,
      label: t('queue.skill.vocabulary'),
      hint: t('queue.skill.vocabulary.hint'),
      done: queue.vocabularyDone,
      icon: BookOpen,
    },
    {
      key: 'listening' as const,
      label: t('queue.skill.listening'),
      hint: t('queue.skill.listening.hint'),
      done: queue.listeningDone,
      icon: Ear,
    },
    {
      key: 'speaking' as const,
      label: t('queue.skill.speaking'),
      hint: t('queue.skill.speaking.hint'),
      done: queue.speakingDone,
      icon: Mic,
    },
    {
      key: 'reading' as const,
      label: t('queue.skill.reading'),
      hint: t('queue.skill.reading.hint'),
      done: queue.readingDone,
      icon: FileText,
    },
    {
      key: 'writing' as const,
      label: t('queue.skill.writing'),
      hint: t('queue.skill.writing.hint'),
      done: queue.writingDone,
      icon: PenLine,
    },
  ]

  // Full-screen skill panel
  if (activePanel !== null) {
    // Skill sessions wired in Task 14 — placeholder for now
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-muted-foreground">
          <div>
            {activePanel}
            {' '}
            session — coming soon
          </div>
          <Button variant="ghost" onClick={() => { setActivePanel(null); void queue.refresh() }}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-[340px] bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

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
      <div className="p-3 border-b border-border">
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
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpanded(e => !e)}
              >
                <CircleIndicator
                  done={queue.dailyReviewDone}
                  partial={!queue.dailyReviewDone && skills.some(s => s.done)}
                />
                <span className={cn(
                  'flex-1 text-sm font-semibold',
                  queue.dailyReviewDone ? 'line-through text-muted-foreground' : '',
                )}
                >
                  {t('queue.dailyReview')}
                </span>
                <motion.span
                  animate={{ rotate: expanded ? 0 : -90 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="flex items-center"
                >
                  <ChevronDown className="size-4 text-muted-foreground/50" />
                </motion.span>
              </button>

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
                      <div className="absolute left-[27px] top-0 bottom-2 w-px bg-border/50" />
                      {skills.map(skill => (
                        <SkillRow
                          key={skill.key}
                          label={skill.label}
                          hint={skill.hint}
                          done={skill.done}
                          doneLabel={t('queue.subtask.done')}
                          Icon={skill.icon}
                          onStart={() => setActivePanel(skill.key)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {(mostRecentLesson || queue.customTasks.length > 0) && (
                <div className="h-px bg-border/30 mx-4 my-0.5" />
              )}
            </>
          )}

          {/* Shadowing */}
          {mostRecentLesson && (
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
              onClick={handleStartShadowing}
            >
              <CircleIndicator done={queue.shadowingDone} partial={false} />
              <span className={cn(
                'flex-1 text-sm font-semibold',
                queue.shadowingDone ? 'line-through text-muted-foreground' : '',
              )}
              >
                {t('queue.shadowing')}
              </span>
              {!queue.shadowingDone && <StartButton primary={false} />}
            </button>
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
                {task.completedDate === today && <Check className="size-3" />}
              </button>
              {editingTaskId === task.id
                ? (
                    <input
                      type="text"
                      className="flex-1 text-sm font-semibold bg-muted/40 rounded-lg px-2 py-1 border border-primary focus:outline-none transition-colors"
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
                type="button"
                className="text-destructive hover:text-destructive"
                onMouseDown={(e) => { e.preventDefault(); void queue.removeCustomTask(task.id) }}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add task */}
      <div className="py-1">
        <div className="h-px bg-border/30 mx-4 my-0.5" />
        {addingTask
          ? (
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="size-4 rounded-full border-2 border-dashed border-primary/40 shrink-0" />
                <input
                  type="text"
                  className="flex-1 text-sm font-semibold bg-muted/40 rounded-lg px-2.5 py-1.5 border border-border focus:border-primary focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
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
                <div className="size-4 rounded-full border border-dashed border-border/40 group-hover:border-primary/40 flex items-center justify-center shrink-0 transition-colors">
                  <Plus className="size-2.5 text-muted-foreground/50 group-hover:text-primary/60 transition-colors" />
                </div>
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
          ? 'border-emerald-500 bg-emerald-500/10'
          : 'border-border',
    )}
    >
      {done && <Check className="size-3" />}
      {partial && !done && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    </div>
  )
}

interface SkillRowProps {
  label: string
  hint: string
  done: boolean
  doneLabel: string
  Icon: React.ElementType
  onStart: () => void
}

function SkillRow({ label, hint, done, doneLabel, Icon, onStart }: SkillRowProps) {
  return (
    <div
      role="button"
      tabIndex={done ? -1 : 0}
      className="relative flex items-center gap-3 pl-6 pr-4 py-1.5 rounded-lg hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors cursor-pointer"
      onClick={done ? undefined : onStart}
      onKeyDown={done ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart() } }}
    >
      <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border/50" />
      <div className={cn(
        'size-6 rounded-md flex items-center justify-center shrink-0',
        done ? 'bg-emerald-500/10' : 'bg-primary/10',
      )}
      >
        <Icon className={cn('size-3.5', done ? 'text-emerald-500' : 'text-primary')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', done ? 'line-through text-muted-foreground' : '')}>
          {label}
        </div>
        {!done && <div className="text-xs text-muted-foreground/50 mt-0.5">{hint}</div>}
      </div>
      {done
        ? <span className="text-xs font-bold text-emerald-500 shrink-0">{doneLabel}</span>
        : <StartButton primary={false} onClick={onStart} />}
    </div>
  )
}

function StartButton({ primary, onClick }: { primary: boolean, onClick?: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105',
        primary
          ? 'bg-primary text-primary-foreground'
          : 'border border-primary/30 text-primary',
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <span className="text-xs">›</span>
    </button>
  )
}
