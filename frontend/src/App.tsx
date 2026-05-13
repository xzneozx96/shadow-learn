import { Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorScreen } from '@/components/ErrorScreen'
import { LessonView } from '@/components/lesson/LessonView'
import { Library } from '@/components/library/Library'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { Settings } from '@/components/settings/Settings'
import { PracticeSpeakingModal } from '@/components/speak/PracticeSpeakingModal'
import { DailyQueuePopup } from '@/components/study-queue/DailyQueuePopup'
import { QueueFloatingBadge } from '@/components/study-queue/QueueFloatingBadge'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { GlobalCompanionProvider } from '@/contexts/GlobalCompanionContext'
import { I18nProvider } from '@/contexts/I18nContext'
import { LessonsProvider } from '@/contexts/LessonsContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { SpeakModalProvider, useSpeakModal } from '@/contexts/SpeakModalContext'
import { StudyQueueProvider, useStudyQueueContext } from '@/contexts/StudyQueueContext'
import { VocabularyProvider } from '@/contexts/VocabularyContext'
import { ChangelogPage } from '@/pages/ChangelogPage'
import { CollectionPage } from '@/pages/CollectionPage'
import { DocumentationPage } from '@/pages/DocumentationPage'
import { PlaylistPage } from '@/pages/PlaylistPage'
import { WorkbookPage } from '@/pages/WorkbookPage'

// Lazy-loaded: pulls in `hanzi` (~7.7 MB dictionary) only when user enters study flow.
const StudySessionPage = lazy(() =>
  import('@/pages/StudySessionPage').then(m => ({ default: m.StudySessionPage })),
)

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function GlobalSpeakModal() {
  const { isOpen, closeSpeakModal } = useSpeakModal()
  return <PracticeSpeakingModal open={isOpen} onClose={closeSpeakModal} />
}

function RouteErrorElement() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

function StudyQueueUI() {
  const queue = useStudyQueueContext()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const autoOpenFiredRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoOpenFiredRef.current || queue.loading || location.pathname !== '/')
      return
    const today = new Date().toISOString().split('T')[0]
    if (localStorage.getItem('study-queue-last-shown') === today)
      return
    autoOpenFiredRef.current = true
    localStorage.setItem('study-queue-last-shown', today)
    const timer = setTimeout(() => {
      setOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [queue.loading, location.pathname])

  useEffect(() => {
    if (!open)
      return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full right-0 mb-3"
            style={{ transformOrigin: 'bottom right' }}
            initial={{ opacity: 0, scale: 0.88, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 10 }}
            transition={{ duration: 0.2, ease: [0.175, 0.885, 0.32, 1.275] }}
          >
            <DailyQueuePopup queue={queue} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <QueueFloatingBadge queue={queue} open={open} onClick={() => setOpen(o => !o)} />
    </div>
  )
}

function AppLayout() {
  return (
    <PlayerProvider>
      <GlobalCompanionProvider>
        <SpeakModalProvider>
          <Outlet />
          {/* <FeedbackButton /> */}
          <GlobalSpeakModal />
          <StudyQueueUI />
        </SpeakModalProvider>
      </GlobalCompanionProvider>
    </PlayerProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorElement />,
    children: [
      { path: '/', element: <Library /> },
      { path: '/create', element: <CreateLesson /> },
      { path: '/changelog', element: <ChangelogPage /> },
      { path: '/collection', element: <CollectionPage /> },
      { path: '/collection/:playlistId', element: <PlaylistPage /> },
      { path: '/docs', element: <DocumentationPage /> },
      { path: '/lesson/:id', element: <LessonView /> },
      { path: '/settings', element: <Settings /> },
      { path: '/vocabulary', element: <WorkbookPage /> },
      {
        path: '/vocabulary/:lessonId/study',
        element: (
          <Suspense fallback={<PageLoader />}>
            <StudySessionPage />
          </Suspense>
        ),
      },
    ],
  },
])

function AuthGate() {
  const { isFirstSetup, isUnlocked, trialMode, db } = useAuth()

  // Loading state — wait for DB regardless of trial mode
  // (trialMode is synchronous; db is async — show spinner until both are ready)
  if (isFirstSetup === null || db === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // First launch — set up keys (skip if in trial)
  if (isFirstSetup && !trialMode) {
    return <Setup />
  }

  // Keys exist but locked (skip if in trial)
  if (!isUnlocked && !trialMode) {
    return <Unlock />
  }

  // Authenticated or trial mode — show app
  return (
    <ErrorBoundary>
      <VocabularyProvider>
        <LessonsProvider>
          <StudyQueueProvider>
            <RouterProvider router={router} />
          </StudyQueueProvider>
        </LessonsProvider>
      </VocabularyProvider>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <AuthGate />
        <Toaster position="top-right" richColors closeButton />
      </I18nProvider>
    </AuthProvider>
  )
}
