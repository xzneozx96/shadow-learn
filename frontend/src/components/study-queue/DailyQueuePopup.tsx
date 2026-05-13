import type { StudyQueueState } from '@/hooks/useStudyQueue'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SentenceHuntSession } from '@/components/study-queue/SentenceHuntSession'
import { StudySession } from '@/components/study/StudySession'
import { Button } from '@/components/ui/button'
import { useLessons } from '@/contexts/LessonsContext'
import { cn } from '@/lib/utils'

const ROLEPLAY_SCENES = ['café', 'taxi', 'market', 'doctor', 'hotel']

type ActivePanel = null | 'word-drills' | 'sentence-hunt'

interface Props {
  queue: StudyQueueState
  onClose: () => void
}

export function DailyQueuePopup({ queue, onClose }: Props) {
  const { lessons } = useLessons()
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [expanded, setExpanded] = useState(true)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const mostRecentLesson = [...lessons]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .find(l => !l.status || l.status === 'complete')

  const hasAnyContent
    = queue.hasWordDrills
      || queue.hasSentenceHunt
      || queue.hasRoleplay
      || !!mostRecentLesson

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
      `The learner is reviewing these words today: ${wordList}.`,
      'Hold a natural conversation in the scene below.',
      'Naturally use and elicit these words.',
      'After 5–6 exchanges, note which target words the learner used successfully.',
      `Scene: ${scene}`,
    ].join('\n')
    navigate(`/lesson/${mostRecentLesson.id}`, {
      state: { roleplaySystemPrompt: systemPrompt },
    })
    onClose()
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
          onClose={() => { setActivePanel(null); void queue.refresh() }}
          onSessionComplete={() => void queue.refresh()}
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

  // ── Popup overlay ──────────────────────────────────────────────────────────

  const primary = primarySubtask()
  const dailyReviewDone
    = (!queue.hasWordDrills || queue.wordDrillsDone)
      && (!queue.hasSentenceHunt || queue.sentenceHuntDone)
      && (!queue.hasRoleplay || queue.roleplayDone)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {queue.allDoneToday
            ? (
                <>
                  <div className="text-xl font-bold text-emerald-400">All done! 🎉</div>
                  <div className="text-sm text-muted-foreground mt-0.5">Great session today</div>
                </>
              )
            : (
                <>
                  <div className="text-xl font-bold">Today's Practice</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {queue.incompleteCount > 0
                      ? `${queue.incompleteCount} item${queue.incompleteCount !== 1 ? 's' : ''} left`
                      : 'Loading…'}
                  </div>
                </>
              )}
        </div>

        {/* Empty state (no lessons, no vocab) */}
        {!hasAnyContent && !queue.loading && (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            Create your first lesson to start your study queue.
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
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setExpanded(e => !e)}
                >
                  <CircleIndicator
                    done={dailyReviewDone}
                    partial={!dailyReviewDone && (queue.wordDrillsDone || queue.sentenceHuntDone || queue.roleplayDone)}
                  />
                  <span className={cn(
                    'flex-1 text-sm font-semibold',
                    dailyReviewDone ? 'line-through text-muted-foreground' : '',
                  )}
                  >
                    Daily Review
                  </span>
                  <span className="text-muted-foreground/50 text-sm">{expanded ? '▾' : '▸'}</span>
                </button>

                {expanded && (
                  <div className="relative pl-4 mb-1">
                    <div className="absolute left-[27px] top-0 bottom-2 w-px bg-border/50" />
                    {queue.hasWordDrills && (
                      <SubtaskRow
                        label="Word Drills"
                        hint="Dictation · Pinyin recall · Writing"
                        done={queue.wordDrillsDone}
                        primary={primary === 'word-drills'}
                        onStart={() => setActivePanel('word-drills')}
                      />
                    )}
                    {queue.hasSentenceHunt && (
                      <SubtaskRow
                        label="Sentence Hunt"
                        hint="Pronunciation in context"
                        done={queue.sentenceHuntDone}
                        primary={primary === 'sentence-hunt'}
                        onStart={() => setActivePanel('sentence-hunt')}
                      />
                    )}
                    {queue.hasRoleplay && (
                      <SubtaskRow
                        label="Roleplay"
                        hint="Free conversation"
                        done={queue.roleplayDone}
                        primary={primary === 'roleplay'}
                        onStart={handleStartRoleplay}
                      />
                    )}
                  </div>
                )}

                <div className="h-px bg-border/30 mx-4 my-0.5" />
              </>
            )}

            {/* Shadowing Practice */}
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
                  Shadowing Practice
                </span>
                {!queue.shadowingDone && <StartButton primary={false} />}
              </button>
            )}

            {/* Custom tasks */}
            {queue.customTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  className={cn(
                    'w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center text-[10px] font-bold transition-colors',
                    task.completedDate === today
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-border hover:border-primary/50',
                  )}
                  onClick={() => void queue.toggleCustomTask(task.id)}
                >
                  {task.completedDate === today && '✓'}
                </button>
                <span className={cn(
                  'flex-1 text-sm font-semibold',
                  task.completedDate === today ? 'line-through text-muted-foreground' : '',
                )}
                >
                  {task.title}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground/30 hover:text-muted-foreground text-xs"
                  onClick={() => void queue.removeCustomTask(task.id)}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className="h-px bg-border/30 mx-4 my-0.5" />

            {/* Add custom task */}
            {addingTask
              ? (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <input
                      type="text"
                      className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary pb-0.5"
                      placeholder="Task name…"
                      value={newTaskTitle}
                      autoFocus
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          void handleAddTask()
                        if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => void handleAddTask()}>
                      Add
                    </Button>
                  </div>
                )
              : (
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setAddingTask(true)}
                  >
                    <div className="w-[18px] h-[18px] rounded-full border border-dashed border-border/50 flex items-center justify-center text-xs text-muted-foreground">
                      +
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground/60">
                      Add your own item
                    </span>
                  </button>
                )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end px-4 py-3">
          <button
            type="button"
            className="text-xs font-semibold text-muted-foreground/50 hover:text-muted-foreground"
            onClick={onClose}
          >
            {queue.allDoneToday ? 'Close' : 'Hide for today'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CircleIndicator({ done, partial }: { done: boolean, partial: boolean }) {
  return (
    <div className={cn(
      'w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center text-[10px] font-bold',
      done
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : partial
          ? 'border-emerald-500 bg-emerald-500/10'
          : 'border-border',
    )}
    >
      {done && '✓'}
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
      <div className="absolute left-0 top-1/2 w-2.5 h-px bg-border/50" />
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', done ? 'line-through text-muted-foreground' : '')}>
          {label}
        </div>
        {!done && <div className="text-xs text-muted-foreground/50 mt-0.5">{hint}</div>}
      </div>
      {done
        ? <span className="text-xs font-bold text-emerald-500 shrink-0">✓ Done</span>
        : <StartButton primary={primary} onClick={onStart} />}
    </div>
  )
}

function StartButton({ primary, onClick }: { primary: boolean, onClick?: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 transition-transform hover:scale-105',
        primary
          ? 'bg-primary text-primary-foreground'
          : 'border border-primary/30 text-primary',
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      ▶
    </button>
  )
}
