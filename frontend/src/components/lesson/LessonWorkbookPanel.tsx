import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useVocabulary } from '@/hooks/useVocabulary'

interface LessonWorkbookPanelProps {
  lessonId: string
}

export function LessonWorkbookPanel({ lessonId }: LessonWorkbookPanelProps) {
  const { entriesByLesson } = useVocabulary()
  const navigate = useNavigate()
  const entries = entriesByLesson[lessonId] ?? []
  const count = entries.length

  return (
    <div className="flex h-full flex-col">
      {/* Sub-header: count + "View all" link */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? 'word' : 'words'} saved
        </span>
        <Link
          to="/vocabulary"
          className="text-xs text-foreground transition-colors hover:text-foreground/70"
        >
          View all →
        </Link>
      </div>

      {/* Word grid or empty state */}
      {count === 0
        ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Hover any word in the transcript and tap the bookmark to save it here
              </p>
            </div>
          )
        : (
            <ScrollArea className="min-h-0 flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {entries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() =>
                      navigate(`/lesson/${lessonId}?segmentId=${entry.sourceSegmentId}`)}
                    className="cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <p className="text-2xl font-bold text-foreground">{entry.word}</p>
                    <p className="text-xs text-muted-foreground">{entry.pinyin}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground/70">{entry.meaning}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

      {/* Study button — pinned to bottom */}
      <div className="border-t border-border p-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper required: disabled buttons don't fire hover events */}
              <span className="block w-full">
                <Button
                  className="w-full"
                  disabled={count === 0}
                  onClick={() => navigate(`/vocabulary/${lessonId}/study`)}
                >
                  Study This Lesson →
                </Button>
              </span>
            </TooltipTrigger>
            {count === 0 && (
              <TooltipContent>Save at least one word first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
