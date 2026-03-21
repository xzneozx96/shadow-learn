/**
 * Inline generative UI components for agent tool results.
 * These are lightweight renderers mounted by CompanionPanel when
 * tool parts reach output-available state.
 */

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { cn } from '@/lib/utils'

// -------------------------------------------------------------------------- //
// Tool display names — short human-readable labels
// -------------------------------------------------------------------------- //

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_study_context: 'Study Context',
  get_vocabulary: 'Vocabulary',
  get_progress_summary: 'Progress Summary',
  get_pedagogical_guidelines: 'Teaching Guidelines',
  recall_memory: 'Memory Search',
  save_memory: 'Save Memory',
  update_sr_item: 'Review Schedule',
  log_mistake: 'Log Mistake',
  update_learner_profile: 'Learner Profile',
  render_dictation_exercise: 'Dictation Exercise',
  render_character_writing_exercise: 'Writing Exercise',
  render_romanization_exercise: 'Romanization Exercise',
  render_translation_exercise: 'Translation Exercise',
  render_pronunciation_exercise: 'Pronunciation Exercise',
  render_cloze_exercise: 'Cloze Exercise',
  render_reconstruction_exercise: 'Reconstruction Exercise',
  render_progress_chart: 'Progress Chart',
  render_vocab_card: 'Vocab Card',
}

// -------------------------------------------------------------------------- //
// ToolCallCard — AI Elements Tool wrapper for all tool states
// -------------------------------------------------------------------------- //

export function ToolCallCard({
  toolName,
  state,
  isError = false,
  errorMessage,
  input,
  output,
}: {
  toolName: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  isError?: boolean
  errorMessage?: string
  input?: unknown
  output?: unknown
}) {
  const title = TOOL_DISPLAY_NAMES[toolName] ?? toolName
  const effectiveState = isError ? 'output-error' as const : state
  const hasContent = input != null || output != null || (isError && errorMessage)

  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName={toolName}
        title={title}
        state={effectiveState}
      />
      {hasContent && (
        <ToolContent>
          {input != null && <ToolInput input={input} />}
          {(output != null || (isError && errorMessage)) && (
            <ToolOutput
              output={isError ? undefined : output}
              errorText={isError ? (errorMessage ?? 'Tool execution failed') : undefined}
            />
          )}
        </ToolContent>
      )}
    </Tool>
  )
}

// -------------------------------------------------------------------------- //
// VocabCardRenderer — compact inline vocab card
// -------------------------------------------------------------------------- //

interface VocabCardResult {
  entry?: { id: string, word: string, romanization?: string, meaning: string, usage?: string }
  error?: string
}

export function VocabCardRenderer({ result }: { result: VocabCardResult }) {
  if (result.error) {
    return <span className="text-sm text-muted-foreground italic">{result.error}</span>
  }

  const { entry } = result
  if (!entry)
    return null

  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 my-1 max-w-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{entry.word}</span>
        {entry.romanization && (
          <span className="text-sm text-muted-foreground">{entry.romanization}</span>
        )}
      </div>
      <p className="text-sm text-foreground">{entry.meaning}</p>
      {entry.usage && (
        <p className="text-sm text-muted-foreground italic mt-1">
          "
          {entry.usage}
          "
        </p>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------- //
// ProgressChartRenderer — accuracy trend or mastery overview
// -------------------------------------------------------------------------- //

interface AccuracyDataPoint { date: string, accuracy: number, exercises: number }

interface ProgressChartResult {
  metric: 'accuracy' | 'mastery'
  data: AccuracyDataPoint[] | Record<string, { masteryLevel: number }> | null
}

export function ProgressChartRenderer({ result }: { result: ProgressChartResult }) {
  if (!result.data) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        No progress data yet. Complete some exercises first!
      </div>
    )
  }

  if (result.metric === 'accuracy' && Array.isArray(result.data)) {
    return <AccuracyMiniChart data={result.data} />
  }

  if (result.metric === 'mastery' && !Array.isArray(result.data)) {
    return <MasteryGrid data={result.data} />
  }

  return null
}

function AccuracyMiniChart({ data }: { data: AccuracyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        No accuracy data yet.
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.accuracy), 1)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 my-1 max-w-md">
      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">
        Accuracy Trend (last
        {' '}
        {data.length}
        {' '}
        days)
      </p>
      <div className="flex items-end gap-1 h-16">
        {data.map((d) => {
          const pct = (d.accuracy / max) * 100
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all',
                  d.accuracy >= 80 ? 'bg-emerald-400/70' : d.accuracy >= 60 ? 'bg-amber-400/70' : 'bg-rose-400/70',
                )}
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
              <span className="text-sm text-muted-foreground/50">
                {d.date.slice(5)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MasteryGrid({ data }: { data: Record<string, { masteryLevel: number }> }) {
  const skills = Object.entries(data)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 my-1 max-w-md">
      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">
        Skill Mastery
      </p>
      <div className="grid grid-cols-2 gap-2">
        {skills.map(([name, stats]) => (
          <div key={name} className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-muted/60 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  stats.masteryLevel >= 80 ? 'bg-emerald-400' : stats.masteryLevel >= 50 ? 'bg-amber-400' : 'bg-rose-400',
                )}
                style={{ width: `${stats.masteryLevel}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground capitalize w-16 truncate">{name}</span>
            <span className="text-sm font-medium tabular-nums">
              {stats.masteryLevel}
              %
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
