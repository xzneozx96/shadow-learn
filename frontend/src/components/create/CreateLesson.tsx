import type { LessonMeta } from '@/types'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings, saveVideo } from '@/db'
import { UploadTab } from './UploadTab'
import { YouTubeTab } from './YouTubeTab'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'vi', label: 'Vietnamese' },
]

export function CreateLesson() {
  const { db, keys } = useAuth()
  const navigate = useNavigate()
  const { updateLesson } = useLessons()

  const [tab, setTab] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('en')
  const [submitting, setSubmitting] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s)
        setLanguage(s.translationLanguage)
    })
  }, [db])

  const handleGenerate = useCallback(async () => {
    if (!db || !keys)
      return
    const isYoutube = tab === 'youtube'
    if (isYoutube && !youtubeUrl.trim())
      return
    if (!isYoutube && !file)
      return

    setSubmitting(true)
    setError(null)

    try {
      let jobId: string
      let lessonSource: 'youtube' | 'upload'
      let lessonSourceUrl: string | null = null
      let lessonTitle: string
      let capturedFile: File | null = null

      if (isYoutube) {
        const res = await fetch('/api/lessons/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'youtube',
            youtube_url: youtubeUrl,
            translation_languages: [language],
            openai_api_key: keys.openaiApiKey,
            deepgram_api_key: keys.deepgramApiKey ?? null,
            model: 'gpt-4o-mini',
          }),
        })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'youtube'
        const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        const videoId = match?.[1] ?? 'unknown'
        lessonTitle = `YouTube Video (${videoId})`
        lessonSourceUrl = youtubeUrl
      }
      else {
        capturedFile = file!
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('translation_languages', language)
        formData.append('openai_api_key', keys.openaiApiKey)
        formData.append('model', 'gpt-4o-mini')
        if (keys.deepgramApiKey)
          formData.append('deepgram_api_key', keys.deepgramApiKey)

        const res = await fetch('/api/lessons/generate-upload', { method: 'POST', body: formData })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'upload'
        lessonTitle = file!.name.replace(/\.[^/.]+$/, '')
      }

      const lessonId = crypto.randomUUID()
      const now = new Date().toISOString()

      // For uploads: persist audio to IndexedDB before navigating (component will unmount)
      if (lessonSource === 'upload' && capturedFile) {
        await saveVideo(db, lessonId, capturedFile)
      }

      await updateLesson({
        id: lessonId,
        title: lessonTitle,
        source: lessonSource,
        sourceUrl: lessonSourceUrl,
        translationLanguages: [language],
        createdAt: now,
        lastOpenedAt: now,
        progressSegmentId: null,
        tags: [],
        status: 'processing',
        jobId,
      } as LessonMeta)

      setQueued(true)
      setYoutubeUrl('')
      setFile(null)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    }
    finally {
      setSubmitting(false)
    }
  }, [db, keys, tab, youtubeUrl, file, language, updateLesson])

  const canGenerate = (tab === 'youtube' ? !!youtubeUrl.trim() : !!file) && !!keys?.deepgramApiKey

  if (queued) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-sm text-white/65">
                Lesson queued — track progress in the library
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/')}>Go to Library</Button>
                <Button variant="ghost" onClick={() => setQueued(false)}>Queue Another</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Lesson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={tab} onValueChange={v => setTab(v as string)}>
              <TabsList>
                <TabsTrigger value="youtube">YouTube</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>
              <TabsContent value="youtube">
                <YouTubeTab url={youtubeUrl} onUrlChange={setYoutubeUrl} />
              </TabsContent>
              <TabsContent value="upload">
                <UploadTab file={file} onFileChange={setFile} />
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/65">Translation Language</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              disabled={!canGenerate || submitting}
              onClick={handleGenerate}
              className="w-full"
            >
              <Sparkles className="size-4" />
              {submitting ? 'Starting…' : 'Generate Lesson'}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
