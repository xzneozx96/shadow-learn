import type { PipelineStep } from './ProcessingStatus'
import type { LessonMeta, Segment } from '@/types'
import { Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
]

const DEFAULT_STEPS: PipelineStep[] = [
  { id: 'download', label: 'Downloading media', status: 'pending' },
  { id: 'transcribe', label: 'Transcribing audio', status: 'pending' },
  { id: 'segment', label: 'Creating segments', status: 'pending' },
  { id: 'translate', label: 'Translating', status: 'pending' },
  { id: 'vocabulary', label: 'Extracting vocabulary', status: 'pending' },
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

  const updateStep = useCallback((id: string, status: PipelineStep['status'], error?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, error } : s))
  }, [])

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
          headers: {
            'Content-Type': 'application/json',
            'X-OpenRouter-Key': keys.openrouterApiKey,
          },
          body: JSON.stringify({
            url: youtubeUrl,
            translationLanguage: language,
            model: model || undefined,
          }),
        })
      }
      else {
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('translationLanguage', language)
        if (model)
          formData.append('model', model)

        response = await fetch('/api/lessons/generate-upload', {
          method: 'POST',
          headers: {
            'X-OpenRouter-Key': keys.openrouterApiKey,
          },
          body: formData,
        })
      }

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`)
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

              if (currentEvent === 'step') {
                updateStep(data.id, data.status, data.error)
              }
              else if (currentEvent === 'error') {
                const failedStep = steps.find(s => s.status === 'active')
                if (failedStep)
                  updateStep(failedStep.id, 'error', data.message)
                setProcessing(false)
                return
              }
              else if (currentEvent === 'complete') {
                const meta: LessonMeta = data.meta
                const segments: Segment[] = data.segments

                await saveLessonMeta(db, meta)
                await saveSegments(db, meta.id, segments)

                if (data.videoBlob) {
                  const blob = await fetch(data.videoBlob).then(r => r.blob())
                  await saveVideo(db, meta.id, blob)
                }

                navigate(`/lesson/${meta.id}`)
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
      const activeStep = steps.find(s => s.status === 'active') ?? steps[0]
      updateStep(activeStep.id, 'error', err instanceof Error ? err.message : 'Unknown error')
    }
    finally {
      setProcessing(false)
    }
  }, [db, keys, tab, youtubeUrl, file, language, model, navigate, updateStep, steps])

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
                      <label className="text-sm font-medium text-slate-300">Translation Language</label>
                      <Select value={language} onValueChange={v => v !== null && setLanguage(v)}>
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
                      <label className="text-sm font-medium text-slate-300">AI Model (optional)</label>
                      <Input
                        placeholder="e.g. openai/gpt-4o"
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
                    <div className="flex items-center gap-2 text-sm text-slate-300">
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
