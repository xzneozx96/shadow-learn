import { useMemo, useState } from 'react'
import { Layout } from '@/components/Layout'
import { Input } from '@/components/ui/input'
import { LessonGroup } from '@/components/workbook/LessonGroup'
import { useAuth } from '@/contexts/AuthContext'
import { useTTS } from '@/hooks/useTTS'
import { useVocabulary } from '@/hooks/useVocabulary'

export function WorkbookPage() {
  const { entries, entriesByLesson } = useVocabulary()
  const { db, keys } = useAuth()
  const { playTTS, loadingText } = useTTS(db, keys)
  const [search, setSearch] = useState('')

  const lastSaved = entries.length
    ? entries.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
    : null

  // Sort lesson groups by most recently saved entry
  const sortedLessonIds = useMemo(() => {
    return Object.keys(entriesByLesson).sort((a, b) => {
      const latestA = entriesByLesson[a].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
      const latestB = entriesByLesson[b].reduce((x, e) => (e.createdAt > x ? e.createdAt : x), '')
      return latestB.localeCompare(latestA)
    })
  }, [entriesByLesson])

  // Filter entries by search
  const filteredByLesson = useMemo(() => {
    if (!search.trim())
      return entriesByLesson
    const q = search.toLowerCase()
    const result: Record<string, typeof entries> = {}
    for (const [lid, group] of Object.entries(entriesByLesson)) {
      const filtered = group.filter(e =>
        e.word.includes(q) || e.meaning.toLowerCase().includes(q) || e.romanization.includes(q),
      )
      if (filtered.length > 0)
        result[lid] = filtered
    }
    return result
  }, [entriesByLesson, search])

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-9 pb-20">
        {/* Header */}
        <div className="flex items-end justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Workbook</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {entries.length}
              {' '}
              words ·
              {sortedLessonIds.length}
              {' '}
              lessons
            </p>
          </div>
          <Input
            className="w-48"
            placeholder="Search words…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          {[
            { value: entries.length, label: 'Words saved' },
            { value: sortedLessonIds.length, label: 'Lessons' },
            { value: lastSaved ? new Date(lastSaved).toLocaleDateString() : '—', label: 'Last saved' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-border bg-card backdrop-blur-xl p-4">
              <div className="text-xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {sortedLessonIds.length === 0 && (
          <div className="text-center py-20 text-muted-foreground text-sm">
            No words saved yet. Open a lesson and tap the bookmark icon on any word.
          </div>
        )}

        {/* No search results state */}
        {sortedLessonIds.length > 0 && search.trim() && Object.keys(filteredByLesson).length === 0 && (
          <div className="text-center py-20 text-muted-foreground text-sm">
            No words match "
            {search}
            ".
          </div>
        )}

        {/* Groups */}
        <div className="flex flex-col gap-7">
          {sortedLessonIds
            .filter(id => filteredByLesson[id])
            .map(id => (
              <LessonGroup
                key={id}
                lessonId={id}
                lessonTitle={filteredByLesson[id][0].sourceLessonTitle}
                entries={filteredByLesson[id]}
                onPlay={playTTS}
                loadingWord={loadingText}
              />
            ))}
        </div>
      </div>
    </Layout>
  )
}
