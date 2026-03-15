import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'mixed'

const MODES: { id: ExerciseMode; icon: string; name: string; desc: string }[] = [
  { id: 'cloze',          icon: '✍️', name: 'Cloze',        desc: 'Fill blanks in a story' },
  { id: 'dictation',      icon: '🎧', name: 'Dictation',    desc: 'Hear it, type it' },
  { id: 'pinyin',         icon: '🔤', name: 'Pinyin',       desc: 'See char, type pinyin' },
  { id: 'pronunciation',  icon: '🎤', name: 'Speak',        desc: 'Pronounce & score' },
  { id: 'reconstruction', icon: '🔀', name: 'Rebuild',      desc: 'Unscramble sentence' },
]

interface ModePickerProps {
  selected: ExerciseMode
  onSelect: (mode: ExerciseMode) => void
  count: number
  onCountChange: (n: number) => void
  onStart: () => void
  lessonTitle: string
}

export function ModePicker({ selected, onSelect, count, onCountChange, onStart, lessonTitle }: ModePickerProps) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">Start a Study Session</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-8">{lessonTitle}</p>

      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-3">Exercise type</p>

      {/* 3-column grid for individual modes */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(
              'py-3.5 px-2.5 rounded-[var(--radius)] text-center border transition-all',
              selected === m.id
                ? 'bg-accent border-border/60 shadow-sm'
                : 'bg-secondary/60 border-border hover:bg-accent/60',
            )}
          >
            <span className="text-xl block mb-1.5">{m.icon}</span>
            <div className="text-[11px] font-semibold">{m.name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{m.desc}</div>
          </button>
        ))}
        {/* placeholder for symmetry — 5 modes + 1 placeholder = 6 = 2 rows of 3 */}
        <div className="rounded-[var(--radius)] border border-border/30 bg-secondary/20 flex items-center justify-center text-xs text-muted-foreground/30">
          More soon
        </div>
      </div>

      {/* Mixed — full width */}
      <button
        onClick={() => onSelect('mixed')}
        className={cn(
          'w-full flex items-center gap-4 p-4 rounded-[var(--radius)] border transition-all text-left mb-2',
          selected === 'mixed'
            ? 'bg-accent border-border/60 shadow-sm'
            : 'bg-secondary/60 border-border hover:bg-accent/60',
        )}
      >
        <span className="text-lg flex-shrink-0">✍️🎧🎤</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Mixed Practice</div>
          <div className="text-xs text-muted-foreground mt-0.5">All types shuffled together</div>
        </div>
        <span className="text-[10px] font-semibold border border-border rounded-full px-2.5 py-1 text-muted-foreground">
          Recommended
        </span>
      </button>

      {/* Question count */}
      <div className="flex items-center justify-between px-4 py-3 rounded-[var(--radius)] bg-secondary/60 border border-border">
        <span className="text-sm text-muted-foreground">Questions</span>
        <div className="flex items-center gap-3">
          <button
            className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.max(5, count - 1))}
          >−</button>
          <span className="text-base font-bold w-6 text-center">{count}</span>
          <button
            className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.min(20, count + 1))}
          >+</button>
        </div>
      </div>

      <Button className="w-full mt-4" onClick={onStart}>
        Start session →
      </Button>
    </div>
  )
}
