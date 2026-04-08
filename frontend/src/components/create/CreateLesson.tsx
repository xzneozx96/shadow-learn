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
import { useI18n } from '@/contexts/I18nContext'
import { useLessons } from '@/contexts/LessonsContext'
import { getSettings, saveVideo } from '@/db'
import { API_BASE, getAppConfig } from '@/lib/config'
import { LANGUAGES } from '@/lib/constants'
import { captureLessonCreated, captureLessonGenerationFailed } from '@/lib/posthog-events'
import { UploadTab } from './UploadTab'
import { YouTubeTab } from './YouTubeTab'

const YOUTUBE_REGEX = /(?:v=|youtu\.be\/)([\w-]{11})/
const FILE_EXTENSION_REGEX = /\.[^/.]+$/

export function CreateLesson() {
  const { db, keys, trialMode } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { updateLesson } = useLessons()

  const [tab, setTab] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('en')
  const [sourceLanguage, setSourceLanguage] = useState('zh-CN')
  const [submitting, setSubmitting] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sttProvider, setSttProvider] = useState<string | null>(null)

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s)
        setLanguage(s.translationLanguage)
    })
  }, [db])

  useEffect(() => {
    getAppConfig().then(cfg => setSttProvider(cfg.sttProvider))
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!db || (!keys && !trialMode) || !sttProvider)
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
        const res = await fetch(`${API_BASE}/api/lessons/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'youtube',
            youtube_url: youtubeUrl,
            translation_languages: [language],
            source_language: sourceLanguage,
            openrouter_api_key: keys?.openrouterApiKey ?? '',
            ...(sttProvider === 'azure'
              ? { azure_speech_key: keys?.azureSpeechKey ?? '', azure_speech_region: keys?.azureSpeechRegion ?? '' }
              : { deepgram_api_key: keys?.deepgramApiKey ?? '' }),
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
        const match = youtubeUrl.match(YOUTUBE_REGEX)
        const videoId = match?.[1] ?? 'unknown'
        lessonTitle = `YouTube Video (${videoId})`
        lessonSourceUrl = youtubeUrl
      }
      else {
        capturedFile = file!
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('translation_languages', language)
        formData.append('source_language', sourceLanguage)
        formData.append('openrouter_api_key', keys?.openrouterApiKey ?? '')
        if (sttProvider === 'azure') {
          formData.append('azure_speech_key', keys?.azureSpeechKey ?? '')
          formData.append('azure_speech_region', keys?.azureSpeechRegion ?? '')
        }
        else {
          formData.append('deepgram_api_key', keys?.deepgramApiKey ?? '')
        }

        const res = await fetch(`${API_BASE}/api/lessons/generate-upload`, { method: 'POST', body: formData })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'upload'
        lessonTitle = file!.name.replace(FILE_EXTENSION_REGEX, '')
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
        sourceLanguage,
        createdAt: now,
        lastOpenedAt: now,
        progressSegmentId: null,
        tags: [],
        status: 'processing',
        jobId,
      } as LessonMeta)

      captureLessonCreated({ source: lessonSource })
      setQueued(true)
      setYoutubeUrl('')
      setFile(null)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      captureLessonGenerationFailed({ source: tab === 'youtube' ? 'youtube' : 'upload', error_message: msg })
      setError(msg)
    }
    finally {
      setSubmitting(false)
    }
  }, [db, keys, tab, youtubeUrl, file, language, sourceLanguage, updateLesson, sttProvider])

  const canGenerate = sttProvider !== null
    && (tab === 'youtube' ? !!youtubeUrl.trim() : !!file)

  if (queued) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center" data-testid="create-lesson-queued-confirmation">
              <p className="text-sm text-white/65" data-testid="create-lesson-queued-message">
                {t('create.queued')}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/')} data-testid="create-lesson-go-to-library-button">{t('create.goToLibrary')}</Button>
                <Button variant="outline" onClick={() => setQueued(false)} data-testid="create-lesson-queue-another-button">{t('create.queueAnother')}</Button>
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
            <CardTitle>{t('create.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={tab} onValueChange={v => setTab(v as string)} data-testid="create-lesson-tabs">
              <TabsList>
                <TabsTrigger value="youtube" data-testid="create-lesson-youtube-tab">{t('create.youtube')}</TabsTrigger>
                <TabsTrigger value="upload" data-testid="create-lesson-upload-tab">{t('create.upload')}</TabsTrigger>
              </TabsList>
              <TabsContent value="youtube">
                <YouTubeTab url={youtubeUrl} onUrlChange={setYoutubeUrl} />
              </TabsContent>
              <TabsContent value="upload">
                <UploadTab file={file} onFileChange={setFile} />
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/65">{t('create.videoLanguage')}</label>
              <Select value={sourceLanguage} onValueChange={v => v !== null && setSourceLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full" data-testid="create-lesson-source-language-select">
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
              <label className="text-sm font-medium text-white/65">{t('create.translationLanguage')}</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full" data-testid="create-lesson-translation-language-select">
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
              data-testid="create-lesson-generate-button"
            >
              <Sparkles className="size-4" />
              {submitting ? t('create.starting') : t('create.generate')}
            </Button>

            {error && <p className="text-sm text-destructive" data-testid="create-lesson-form-error">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
