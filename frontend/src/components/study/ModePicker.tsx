import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'writing' | 'translation' | 'mixed'

const MODES: { id: ExerciseMode, icon: string, name: string, desc: string }[] = [
  { id: 'mixed', icon: '✍️🎧🎤', name: 'Mixed', desc: 'All types shuffled together' },
  { id: 'cloze', icon: '✍️', name: 'Cloze', desc: 'Fill blanks in a story' },
  { id: 'dictation', icon: '🎧', name: 'Dictation', desc: 'Hear it, type it' },
  { id: 'pinyin', icon: '🔤', name: 'Pinyin', desc: 'See char, type pinyin' },
  { id: 'pronunciation', icon: '🎤', name: 'Speak', desc: 'Pronounce & score' },
  { id: 'reconstruction', icon: '🔀', name: 'Rebuild', desc: 'Unscramble sentence' },
  { id: 'writing', icon: '✏️', name: 'Write', desc: 'Draw the characters' },
]

interface ModePickerProps {
  selected: ExerciseMode
  onSelect: (mode: ExerciseMode) => void
  count: number
  onCountChange: (n: number) => void
  onStart: () => void
  lessonTitle: string
  loading?: boolean
}

export function ModePicker({ selected, onSelect, count, onCountChange, onStart, lessonTitle, loading }: ModePickerProps) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">Start a Study Session</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-8">{lessonTitle}</p>

      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-3">Exercise type</p>

      {/* 3-column grid for individual modes */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(
              'py-3.5 px-2.5 rounded-md text-center border transition-all',
              selected === m.id
                ? 'bg-secondary border-border/60 shadow-sm'
                : 'border-border hover:bg-accent/60',
            )}
          >
            <span className="text-xl block mb-2">{m.icon}</span>
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-tight">{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Question count */}
      <div className="flex items-center justify-between px-4 py-3 rounded-md bg-secondary border border-border">
        <span className="text-sm text-muted-foreground">Questions</span>
        <div className="flex items-center gap-3">
          <button
            className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.max(5, count - 1))}
          >
            −
          </button>
          <span className="text-base font-bold w-6 text-center">{count}</span>
          <button
            className="size-7 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
            onClick={() => onCountChange(Math.min(20, count + 1))}
          >
            +
          </button>
        </div>
      </div>

      <Button className="w-full mt-4" onClick={onStart} disabled={loading}>
        {loading ? 'Generating…' : 'Start session →'}
      </Button>
    </div>
  )
}
