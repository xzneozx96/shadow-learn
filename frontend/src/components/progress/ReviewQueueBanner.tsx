import { Button } from '@/components/ui/button'

interface Props {
  count: number
  onStartReview: () => void
}

export function ReviewQueueBanner({ count, onStartReview }: Props) {
  if (count === 0)
    return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-xl px-6 py-5 flex items-center justify-between shadow-sm group">
      <div className="absolute inset-0 bg-linear-to-r from-emerald-500/10 to-transparent pointer-events-none" />
      <div className="relative z-10">
        <h3 className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">Spaced Repetition Review</h3>
        <p className="text-sm font-medium text-emerald-700/80 dark:text-emerald-300/80 mt-1">
          {`${count} ${count === 1 ? 'item is' : 'items are'} due for practice today.`}
        </p>
      </div>
      <Button
        className="relative z-10 bg-emerald-600 hover:bg-emerald-500 text-white shadow duration-300"
        onClick={onStartReview}
      >
        Start Review →
      </Button>
    </div>
  )
}
