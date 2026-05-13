import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { ArrowRight, Check, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SentenceHuntSession } from '@/components/study-queue/SentenceHuntSession'
import { StudySession } from '@/components/study/StudySession'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { cn } from '@/lib/utils'

const ROLEPLAY_SCENES = ['café', 'taxi', 'market', 'doctor', 'hotel']

type ActivePanel = null | 'word-drills' | 'sentence-hunt'

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

  const hasAnyContent
    = queue.hasWordDrills
      || queue.hasSentenceHunt
      || queue.hasRoleplay
      || !!mostRecentLesson
      || queue.customTasks.length > 0

  // Determine which sub-task gets the primary (filled) CTA
  function primarySubtask(): 'word-drills' | 'sentence-hunt' | 'roleplay' | null {
    if (queue.hasWordDrills && !queue.wordDrillsDone)
      return 'word-drills'
    if (queue.hasSentenceHunt && !queue.sentenceHuntDone)
      return 'sentence-hunt'
    if (queue.hasRoleplay && !queue.roleplayDone)
      return 'roleplay'
    return null
  }

  function handleStartShadowing() {
    if (!mostRecentLesson)
      return
    onClose()
    navigate(`/lesson/${mostRecentLesson.id}?shadowing=true`)
  }

  function handleStartRoleplay() {
    if (!queue.hasRoleplay || !mostRecentLesson)
      return
    queue.markRoleplayDone() // optimistic — user will do it in companion
    const scene = ROLEPLAY_SCENES[Math.floor(Math.random() * ROLEPLAY_SCENES.length)]
    const wordList = queue.wordDrillsEntries
      .map(e => `${e.word} (${e.meaning})`)
      .join(', ')
    const systemPrompt = [
      'You are a Chinese conversation partner.',
      ...(wordList ? [`The learner is reviewing these words today: ${wordList}.`] : []),
      'Hold a natural conversation in the scene below.',
      'Naturally use and elicit these words.',
      'After 5–6 exchanges, note which target words the learner used successfully.',
      `Scene: ${scene}`,
    ].join('\n')
    onClose()
    navigate(`/lesson/${mostRecentLesson.id}`, {
      state: { roleplaySystemPrompt: systemPrompt },
    })
  }

  async function handleAddTask() {
    const title = newTaskTitle.trim()
    if (!title)
      return
    await queue.addCustomTask(title)
    setNewTaskTitle('')
    setAddingTask(false)
  }

  // ── Inline panels ──────────────────────────────────────────────────────────

  if (activePanel === 'word-drills') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <StudySession
          preloadedEntries={queue.wordDrillsEntries}
          onClose={() => setActivePanel(null)}
          onSessionComplete={() => { setActivePanel(null); void queue.refresh() }}
          disableLeaveGuard
        />
      </div>
    )
  }

  if (activePanel === 'sentence-hunt') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <SentenceHuntSession
          segments={queue.sentenceHuntSegments}
          onComplete={() => { setActivePanel(null); void queue.refresh() }}
          onClose={() => setActivePanel(null)}
        />
      </div>
    )
  }

  // ── Popover card ───────────────────────────────────────────────────────────

  const primary = primarySubtask()
  const dailyReviewDone
    = (!queue.hasWordDrills || queue.wordDrillsDone)
      && (!queue.hasSentenceHunt || queue.sentenceHuntDone)
      && (!queue.hasRoleplay || queue.roleplayDone)

  return (
    <div className="relative w-[340px] rounded-2xl overflow-hidden bg-black/20 backdrop-blur-2xl border border-white/10 flex flex-col bg-linear-to-br from-zinc-800/30 to-zinc-800/50 shadow-xl">
      <div className="absolute inset-0 bg-linear-to-b from-white/3 to-transparent pointer-events-none rounded-2xl" />

      {/* Overlay: catches clicks outside the inline edit input, prevents them reaching other items */}
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

      {/* Empty state (no lessons, no vocab) */}
      {!hasAnyContent && !queue.loading && (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {t('queue.empty')}
        </div>
      )}

      {/* Task list */}
      {hasAnyContent && (
        <div className="py-1">

          {/* Daily Review (expandable) */}
          {(queue.hasWordDrills || queue.hasSentenceHunt || queue.hasRoleplay) && (
            <>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpanded(e => !e)}
              >
                <CircleIndicator
                  done={dailyReviewDone}
                  partial={!dailyReviewDone && (
                    (queue.hasWordDrills && queue.wordDrillsDone)
                    || (queue.hasSentenceHunt && queue.sentenceHuntDone)
                    || (queue.hasRoleplay && queue.roleplayDone)
                  )}
                />
                <span className={cn(
                  'flex-1 text-sm font-semibold',
                  dailyReviewDone ? 'line-through text-muted-foreground' : '',
                )}
                >
                  {t('queue.dailyReview')}
                </span>
                <motion.span
                  animate={{ rotate: expanded ? 0 : -90 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="flex items-center"
                >
                  <ChevronDown className="size-4.5 text-muted-foreground/50" />
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
                      <div className="absolute left-6 top-0 bottom-0 w-px bg-primary/20" />
                      {queue.hasWordDrills && (
                        <SubtaskRow
                          label={t('queue.wordDrills')}
                          hint={t('queue.wordDrillsHint')}
                          done={queue.wordDrillsDone}
                          primary={primary === 'word-drills'}
                          onStart={() => setActivePanel('word-drills')}
                        />
                      )}
                      {queue.hasSentenceHunt && (
                        <SubtaskRow
                          label={t('queue.sentenceHunt')}
                          hint={t('queue.sentenceHuntHint')}
                          done={queue.sentenceHuntDone}
                          primary={primary === 'sentence-hunt'}
                          onStart={() => setActivePanel('sentence-hunt')}
                        />
                      )}
                      {queue.hasRoleplay && !!mostRecentLesson && (
                        <SubtaskRow
                          label={t('queue.roleplay')}
                          hint={t('queue.roleplayHint')}
                          done={queue.roleplayDone}
                          primary={primary === 'roleplay'}
                          onStart={handleStartRoleplay}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Shadowing Practice */}
          {mostRecentLesson && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
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
                  'size-4 rounded-full border-2 shrink-0 flex items-center justify-center text-xs font-bold transition-colors',
                  task.completedDate === today
                    ? 'bg-primary border-primary text-white'
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
                        if (e.key === 'Escape') {
                          setEditingTaskId(null)
                        }
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
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

        </div>
      )}

      {/* Add custom task — always visible */}
      <div className="py-1">
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
                    if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    size="icon-xs"
                    variant="default"
                    type="button"
                    className="rounded-full"
                    onClick={() => void handleAddTask()}
                  >
                    <Check className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    type="button"
                    className="text-muted-foreground hover:text-destructive-foreground text-xs rounded-full"
                    onClick={() => { setAddingTask(false); setNewTaskTitle('') }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            )
          : (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group"
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

// ── Sub-components ────────────────────────────────────────────────────────────

function CircleIndicator({ done, partial }: { done: boolean, partial: boolean }) {
  return (
    <div className={cn(
      'size-4 rounded-full border-2 shrink-0 flex items-center justify-center text-[10px] font-bold',
      done
        ? 'bg-primary border-primary text-white'
        : partial
          ? 'border-primary bg-primary/10'
          : 'border-primary/50 hover:border-primary',
    )}
    >
      {done && <Check className="size-3" />}
      {partial && !done && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    </div>
  )
}

interface SubtaskRowProps {
  label: string
  hint: string
  done: boolean
  primary: boolean
  onStart: () => void
}

function SubtaskRow({ label, hint, done, primary, onStart }: SubtaskRowProps) {
  return (
    <div
      className="relative flex items-center gap-3 pl-6 pr-4 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={done ? undefined : onStart}
    >
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', done ? 'line-through text-muted-foreground' : '')}>
          {label}
        </div>
        {!done && <div className="text-xs text-muted-foreground/50 mt-0.5">{hint}</div>}
      </div>
      {done ? <Check className="size-4 text-primary" /> : <StartButton primary={primary} onClick={onStart} />}
    </div>
  )
}

function StartButton({ primary, onClick }: { primary: boolean, onClick?: () => void }) {
  return (
    <button
      className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 transition-transform hover:scale-105',
        primary
          ? 'bg-primary text-primary-foreground'
          : 'border border-primary/30 text-primary',
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <ArrowRight className="size-3 -rotate-45" />
    </button>
  )
}
