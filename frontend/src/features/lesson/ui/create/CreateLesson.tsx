import type { LessonMeta } from '@/shared/types'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Layout } from '@/app/Layout'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { getSettings, saveVideo } from '@/db'
import { useLessons } from '@/features/lesson/application/LessonsContext'
import { API_BASE, getAppConfig } from '@/shared/lib/config'
import { LANGUAGES } from '@/shared/lib/constants'
import { captureLessonCreated, captureLessonGenerationFailed } from '@/shared/lib/posthog-events'
import { DEFAULT_VOICE_ID } from '@/shared/lib/voices'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { BlogTab } from './BlogTab'
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
  const [blogUrl, setBlogUrl] = useState('')
  const [blogText, setBlogText] = useState('')
  const [blogTitle, setBlogTitle] = useState('')
  const [blogVoiceId, setBlogVoiceId] = useState(DEFAULT_VOICE_ID)
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
      if (s) {
        setLanguage(s.translationLanguage)
        if (s.minimaxVoiceId)
          setBlogVoiceId(s.minimaxVoiceId)
      }
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
    if (tab === 'upload' && !file)
      return
    if (tab === 'blog' && !blogUrl.trim() && !blogText.trim())
      return

    setSubmitting(true)
    setError(null)

    try {
      let jobId: string
      let lessonSource: 'youtube' | 'upload' | 'blog'
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
              : {}),
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
      else if (tab === 'upload') {
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
      else if (tab === 'blog') {
        const isPaste = !blogUrl.trim()
        const body: Record<string, unknown> = {
          source: 'blog',
          translation_languages: [language],
          source_language: sourceLanguage,
          openrouter_api_key: keys?.openrouterApiKey ?? '',
          minimax_voice_id: blogVoiceId,
        }
        if (isPaste) {
          body.blog_text = blogText.trim()
          if (blogTitle.trim())
            body.blog_title = blogTitle.trim()
        }
        else {
          body.blog_url = blogUrl
        }
        const res = await fetch(`${API_BASE}/api/lessons/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const detail = await res.json().catch(() => null)
          const msg = detail?.detail || `Server error: ${res.status}`
          toast.error(msg)
          throw new Error(msg)
        }
        const data = await res.json()
        jobId = data.job_id
        lessonSource = 'blog'
        if (isPaste) {
          lessonTitle = blogTitle.trim() || 'Untitled'
          lessonSourceUrl = null
        }
        else {
          try {
            lessonTitle = new URL(blogUrl).hostname
          }
          catch {
            lessonTitle = blogUrl
          }
          lessonSourceUrl = blogUrl
        }
      }
      else {
        return
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
      setBlogUrl('')
      setBlogText('')
      setBlogTitle('')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      captureLessonGenerationFailed({ source: tab === 'youtube' ? 'youtube' : tab === 'blog' ? 'blog' : 'upload', error_message: msg })
      setError(msg)
    }
    finally {
      setSubmitting(false)
    }
  }, [db, keys, tab, youtubeUrl, file, blogUrl, blogText, blogTitle, blogVoiceId, language, sourceLanguage, updateLesson, sttProvider, trialMode])

  const canGenerate = sttProvider !== null
    && (tab === 'youtube'
      ? !!youtubeUrl.trim()
      : tab === 'blog'
        ? (!!blogUrl.trim() || !!blogText.trim())
        : !!file)

  if (queued) {
    return (
      <Layout>
        <div className="relative z-5 mx-auto max-w-2xl p-4 pt-60">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center" data-testid="create-lesson-queued-confirmation">
              <p className="text-sm text-white/65" data-testid="create-lesson-queued-message">
                {t('create.queued')}
              </p>
              <div className="flex gap-2">
                <Button size="lg" onClick={() => navigate('/')} data-testid="create-lesson-go-to-library-button">{t('create.goToLibrary')}</Button>
                <Button variant="outline" size="lg" onClick={() => setQueued(false)} data-testid="create-lesson-queue-another-button">{t('create.queueAnother')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="relative z-5 mx-auto max-w-2xl p-4 pt-60">
        <Card>
          <CardHeader>
            <CardTitle>{t('create.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={tab} onValueChange={v => setTab(v as string)} data-testid="create-lesson-tabs">
              <TabsList>
                <TabsTrigger value="youtube" data-testid="create-lesson-youtube-tab">{t('create.youtube')}</TabsTrigger>
                <TabsTrigger value="upload" data-testid="create-lesson-upload-tab">{t('create.upload')}</TabsTrigger>
                <TabsTrigger value="blog" data-testid="create-lesson-blog-tab">{t('create.blog')}</TabsTrigger>
              </TabsList>
              <TabsContent value="youtube">
                <YouTubeTab url={youtubeUrl} onUrlChange={setYoutubeUrl} />
              </TabsContent>
              <TabsContent value="upload">
                <UploadTab file={file} onFileChange={setFile} />
              </TabsContent>
              <TabsContent value="blog">
                <BlogTab
                  voiceId={blogVoiceId}
                  onVoiceChange={setBlogVoiceId}
                  url={blogUrl}
                  onUrlChange={setBlogUrl}
                  text={blogText}
                  onTextChange={setBlogText}
                  title={blogTitle}
                  onTitleChange={setBlogTitle}
                />
              </TabsContent>
            </Tabs>

            <div>
              <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.videoLanguage')}</label>
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

            <div>
              <label className="text-sm font-medium text-foreground/60 pl-2">{t('create.translationLanguage')}</label>
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
              size="lg"
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
