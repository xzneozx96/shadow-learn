import type { LessonMeta } from '@/types'
import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useLessons } from '@/contexts/LessonsContext'
import { cn } from '@/lib/utils'
import { LessonCard } from './LessonCard'

type SortMode = 'recent' | 'alpha' | 'progress'

export function Library() {
  const { keys } = useAuth()
  const { lessons, updateLesson, deleteLesson } = useLessons()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')

  const filtered = useMemo(() => {
    let result = lessons
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => l.title.toLowerCase().includes(q))
    }

    return result.toSorted((a, b) => {
      // Processing lessons always sort to the top
      const aProcessing = a.status === 'processing'
      const bProcessing = b.status === 'processing'
      if (aProcessing && !bProcessing)
        return -1
      if (!aProcessing && bProcessing)
        return 1

      if (sort === 'recent')
        return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      if (sort === 'alpha')
        return a.title.localeCompare(b.title)
      const pA = a.progressSegmentId && a.segmentCount
        ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount
        : 0
      const pB = b.progressSegmentId && b.segmentCount
        ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount
        : 0
      return pB - pA
    })
  }, [lessons, search, sort])

  const handleDelete = useCallback(async (id: string) => {
    await deleteLesson(id)
  }, [deleteLesson])

  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    await updateLesson({ ...lesson, title: newTitle })
  }, [updateLesson])

  const handleRetry = useCallback(async (lesson: LessonMeta) => {
    // Upload retry: audio blob is already in IndexedDB; only the pipeline needs re-running.
    // The backend does not currently support re-running from a saved blob — the user must
    // re-upload. LessonCard shows "Re-upload to retry" text for upload-sourced errors.
    if (!keys || lesson.source !== 'youtube' || !lesson.sourceUrl)
      return
    const res = await fetch('/api/lessons/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'youtube',
        youtube_url: lesson.sourceUrl,
        translation_languages: lesson.translationLanguages,
        openai_api_key: keys.openaiApiKey,
        deepgram_api_key: keys.deepgramApiKey,
        model: 'gpt-4o-mini',
      }),
    })
    if (!res.ok)
      return
    const { job_id } = await res.json()
    await updateLesson({
      ...lesson,
      status: 'processing',
      jobId: job_id,
      errorMessage: undefined,
      currentStep: undefined,
    })
  }, [keys, updateLesson])

  const sortButtons: { mode: SortMode, label: string }[] = [
    { mode: 'recent', label: 'Recent' },
    { mode: 'alpha', label: 'A-Z' },
    { mode: 'progress', label: 'Progress' },
  ]

  return (
    <Layout onSearch={setSearch} searchValue={search}>
      <div className="p-4">
        <div className="mb-4 flex items-center gap-1">
          {sortButtons.map(({ mode, label }) => (
            <Button
              key={mode}
              variant={sort === mode ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setSort(mode)}
              className={cn(sort === mode && 'font-semibold')}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Card className="flex min-h-[160px] items-center justify-center border-dashed">
            <Button variant="ghost" size="lg" render={<Link to="/create" />}>
              <Plus className="size-5" />
              Add new lesson
            </Button>
          </Card>

          {filtered.map(lesson => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onDelete={handleDelete}
              onRename={handleRename}
              onRetry={handleRetry}
            />
          ))}
        </div>
      </div>
    </Layout>
  )
}
