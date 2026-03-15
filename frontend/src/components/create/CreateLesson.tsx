import type { PipelineStep } from './ProcessingStatus'
import type { LessonMeta } from '@/types'
import { Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { getSettings, saveLessonMeta, saveSegments, saveVideo } from '@/db'
import { ProcessingStatus } from './ProcessingStatus'
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

const DEFAULT_STEPS: PipelineStep[] = [
  { id: 'duration_check', label: 'Checking duration', status: 'pending' },
  { id: 'audio_extraction', label: 'Extracting audio', status: 'pending' },
  { id: 'transcription', label: 'Transcribing audio', status: 'pending' },
  { id: 'pinyin', label: 'Generating pinyin', status: 'pending' },
  { id: 'translation', label: 'Translating segments', status: 'pending' },
  { id: 'vocabulary', label: 'Extracting vocabulary', status: 'pending' },
  { id: 'assembling', label: 'Assembling lesson', status: 'pending' },
]

export function CreateLesson() {
  const { db, keys } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('en')
  const [model, setModel] = useState('')
  const [processing, setProcessing] = useState(false)
  const [steps, setSteps] = useState<PipelineStep[]>(DEFAULT_STEPS)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s) {
        setLanguage(s.translationLanguage)
        setModel(s.defaultModel)
      }
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

    setProcessing(true)
    setSteps(DEFAULT_STEPS.map(s => ({ ...s, status: 'pending', error: undefined })))

    try {
      let response: Response

      if (isYoutube) {
        response = await fetch('/api/lessons/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'youtube',
            youtube_url: youtubeUrl,
            translation_languages: [language],
            openai_api_key: keys.openaiApiKey,
            deepgram_api_key: keys.deepgramApiKey ?? null,
            model: model || 'gpt-4o-mini',
          }),
        })
      }
      else {
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('translation_languages', language)
        formData.append('openai_api_key', keys.openaiApiKey)
        formData.append('model', model || 'gpt-4o-mini')
        if (keys.deepgramApiKey) {
          formData.append('deepgram_api_key', keys.deepgramApiKey)
        }

        response = await fetch('/api/lessons/generate-upload', {
          method: 'POST',
          body: formData,
        })
      }

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        const msg = detail?.detail || `Server error: ${response.status}`
        toast.error(msg)
        throw new Error(msg)
      }
      if (!response.body) {
        toast.error('No response stream from server')
        throw new Error('No response stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            const raw = line.slice(5).trim()
            if (!raw)
              continue

            try {
              const data = JSON.parse(raw)

              if (currentEvent === 'progress') {
                // Backend sends { step: "step_id", message: "..." }
                // Mark current step as active, mark previous steps as done
                setSteps((prev) => {
                  const stepIdx = prev.findIndex(s => s.id === data.step)
                  return prev.map((s, i) => {
                    if (i < stepIdx && s.status !== 'done')
                      return { ...s, status: 'done' as const }
                    if (i === stepIdx)
                      return { ...s, status: 'active' as const }
                    return s
                  })
                })
              }
              else if (currentEvent === 'error') {
                toast.error(data.message || 'Processing failed')
                setSteps(prev => prev.map(s =>
                  s.status === 'active' ? { ...s, status: 'error' as const, error: data.message } : s,
                ))
                setProcessing(false)
                return
              }
              else if (currentEvent === 'complete') {
                // Backend sends { lesson: { title, source, source_url, duration, segments, translation_languages } }
                const lesson = data.lesson
                const lessonId = `lesson_${Date.now()}`
                const meta: LessonMeta = {
                  id: lessonId,
                  title: lesson.title,
                  source: lesson.source,
                  sourceUrl: lesson.source_url,
                  duration: lesson.duration,
                  segmentCount: lesson.segments.length,
                  translationLanguages: lesson.translation_languages,
                  createdAt: new Date().toISOString(),
                  lastOpenedAt: new Date().toISOString(),
                  progressSegmentId: null,
                  tags: [],
                }

                await saveLessonMeta(db, meta)
                await saveSegments(db, lessonId, lesson.segments)

                // Save media for offline playback
                if (isYoutube && data.audio_url) {
                  // Download the extracted audio from the backend
                  const audioResp = await fetch(data.audio_url)
                  if (audioResp.ok) {
                    const audioBlob = await audioResp.blob()
                    await saveVideo(db, lessonId, audioBlob)
                  }
                }
                else if (!isYoutube && file) {
                  await saveVideo(db, lessonId, file)
                }

                // Mark all steps done
                setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })))

                navigate(`/lesson/${lessonId}`)
                return
              }
            }
            catch {
              // ignore parse errors for non-JSON data lines
            }
          }
        }
      }
    }
    catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(errorMsg)
      setSteps((prev) => {
        const activeIdx = prev.findIndex(s => s.status === 'active')
        const targetIdx = activeIdx >= 0 ? activeIdx : 0
        return prev.map((s, i) => i === targetIdx ? { ...s, status: 'error' as const, error: errorMsg } : s)
      })
    }
    finally {
      setProcessing(false)
    }
  }, [db, keys, tab, youtubeUrl, file, language, model, navigate])

  const handleRetry = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  const canGenerate = tab === 'youtube' ? !!youtubeUrl.trim() : !!file

  return (
    <Layout>
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Lesson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!processing
              ? (
                  <>
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
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/65">AI Model (optional)</label>
                      <Input
                        placeholder="e.g. gpt-4o-mini"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                      />
                    </div>

                    <Button
                      disabled={!canGenerate}
                      onClick={handleGenerate}
                      className="w-full"
                    >
                      <Sparkles className="size-4" />
                      Generate Lesson
                    </Button>
                  </>
                )
              : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-white/65">
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </div>
                    <ProcessingStatus steps={steps} onRetry={handleRetry} />
                  </div>
                )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
