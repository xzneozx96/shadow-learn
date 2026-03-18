import { Button } from '@/components/ui/button'
import type { VocabEntry } from '@/types'

interface Result { entry: VocabEntry; correct: boolean }

interface Props {
  results: Result[]
  onStudyAgain: () => void
  onBack: () => void
}

export function SessionSummary({ results, onStudyAgain, onBack }: Props) {
  const correctCount = results.filter(r => r.correct).length
  const wrong = results.filter(r => !r.correct).map(r => r.entry)

  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-border bg-card backdrop-blur-xl p-8 text-center">
      <div className="text-4xl mb-2">{correctCount === results.length ? '🎉' : '💪'}</div>
      <div className="text-4xl font-bold tracking-tight">{correctCount} / {results.length}</div>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        {correctCount === results.length ? 'Perfect session!' : `${wrong.length} word${wrong.length !== 1 ? 's' : ''} to revisit.`}
      </p>

      {wrong.length > 0 && (
        <div className="rounded-[var(--radius)] border border-red-500/20 bg-red-500/8 px-4 py-3 mb-6 text-left">
          <p className="text-[10px] font-semibold tracking-widest text-red-400 uppercase mb-2">Review these</p>
          {wrong.map(e => (
            <div key={e.id} className="flex items-center gap-3 mb-1">
              <span className="text-lg font-bold text-red-300">{e.word}</span>
              <div>
                <div className="text-xs text-foreground">{e.romanization} · {e.meaning}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>Back to Workbook</Button>
        <Button className="flex-1" onClick={onStudyAgain}>Study again</Button>
      </div>
    </div>
  )
}
