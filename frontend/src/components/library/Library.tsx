import type { LessonMeta } from '@/types'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { deleteFullLesson, getAllLessonMetas, saveLessonMeta } from '@/db'
import { cn } from '@/lib/utils'
import { LessonCard } from './LessonCard'

type SortMode = 'recent' | 'alpha' | 'progress'

export function Library() {
  const { db } = useAuth()
  const [lessons, setLessons] = useState<LessonMeta[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')

  useEffect(() => {
    if (!db)
      return
    getAllLessonMetas(db).then(setLessons)
  }, [db])

  const filtered = useMemo(() => {
    let result = lessons
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => l.title.toLowerCase().includes(q))
    }

    return result.toSorted((a, b) => {
      if (sort === 'recent')
        return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      if (sort === 'alpha')
        return a.title.localeCompare(b.title)
      // progress: sort by segment progress descending
      const pA = a.progressSegmentId ? Number.parseInt(a.progressSegmentId, 10) / a.segmentCount : 0
      const pB = b.progressSegmentId ? Number.parseInt(b.progressSegmentId, 10) / b.segmentCount : 0
      return pB - pA
    })
  }, [lessons, search, sort])

  const handleDelete = useCallback(async (id: string) => {
    if (!db)
      return
    await deleteFullLesson(db, id)
    setLessons(prev => prev.filter(l => l.id !== id))
  }, [db])

  const handleRename = useCallback(async (lesson: LessonMeta, newTitle: string) => {
    if (!db)
      return
    await saveLessonMeta(db, { ...lesson, title: newTitle })
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, title: newTitle } : l))
  }, [db])

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
            <LessonCard key={lesson.id} lesson={lesson} onDelete={handleDelete} onRename={handleRename} />
          ))}
        </div>
      </div>
    </Layout>
  )
}
