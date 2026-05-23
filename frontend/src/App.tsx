import { Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router-dom'
import { CompanionFloatingButton } from '@/components/chat/CompanionFloatingButton'
import { GlobalCompanionPanel } from '@/components/chat/GlobalCompanionPanel'
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
import { DailyReviewModal } from '@/components/study-queue/DailyReviewModal'
import { QueueFloatingBadge } from '@/components/study-queue/QueueFloatingBadge'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DailyReviewProvider, useDailyReview } from '@/contexts/DailyReviewContext'
import { GlobalCompanionProvider, useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { I18nProvider } from '@/contexts/I18nContext'
import { LessonsProvider } from '@/contexts/LessonsContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { SpeakModalProvider, useSpeakModal } from '@/contexts/SpeakModalContext'
import { StudyQueueProvider, useStudyQueueContext } from '@/contexts/StudyQueueContext'
import { VocabularyProvider } from '@/contexts/VocabularyContext'
import { todayISO } from '@/lib/date'
import { ChangelogPage } from '@/pages/ChangelogPage'
import { CollectionPage } from '@/pages/CollectionPage'
import { DocumentationPage } from '@/pages/DocumentationPage'
import { PlaylistPage } from '@/pages/PlaylistPage'
import { RegisterMaterialPage } from '@/pages/RegisterMaterialPage'
import { TipCoursePage } from '@/pages/TipCoursePage'
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

function GlobalDailyReview() {
  const { isOpen, initialSkill, closeReviewModal } = useDailyReview()
  const queue = useStudyQueueContext()
  return (
    <DailyReviewModal
      open={isOpen}
      onClose={() => { closeReviewModal(); void queue.refresh() }}
      queue={queue}
      initialSkill={initialSkill}
    />
  )
}

function RouteErrorElement() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

const POPUP_TRANSITION = { duration: 0.2, ease: [0.175, 0.885, 0.32, 1.275] } as const

function FloatingDock() {
  const queue = useStudyQueueContext()
  const { isGlobalPanelOpen, openPanel, closePanel } = useGlobalCompanionContext()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (queue.loading || location.pathname !== '/')
      return
    const today = todayISO()
    if (localStorage.getItem('study-queue-last-shown') === today)
      return
    const timer = setTimeout(() => {
      localStorage.setItem('study-queue-last-shown', today)
      setOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [queue.loading, location.pathname])

  // Click-outside closes the queue popup only (companion popup keeps draft text safe).
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

  // Only one popup open at a time.
  function toggleCompanion() {
    if (isGlobalPanelOpen) {
      closePanel()
    }
    else {
      setOpen(false)
      openPanel()
    }
  }

  function toggleQueue() {
    setOpen((o) => {
      const next = !o
      if (next)
        closePanel()
      return next
    })
  }

  if (location.pathname.startsWith('/lesson/') || location.pathname.startsWith('/tips/'))
    return null

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-4">
      {/* Companion */}
      <div className="relative">
        <AnimatePresence>
          {isGlobalPanelOpen && (
            <motion.div
              className="absolute bottom-full right-0 mb-3"
              style={{ transformOrigin: 'bottom right' }}
              initial={{ opacity: 0, scale: 0.88, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 10 }}
              transition={POPUP_TRANSITION}
            >
              <GlobalCompanionPanel />
            </motion.div>
          )}
        </AnimatePresence>
        <CompanionFloatingButton open={isGlobalPanelOpen} onClick={toggleCompanion} />
      </div>

      {/* Daily Review */}
      <div className="relative">
        <AnimatePresence>
          {open && (
            <motion.div
              className="absolute bottom-full right-0 mb-3"
              style={{ transformOrigin: 'bottom right' }}
              initial={{ opacity: 0, scale: 0.88, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 10 }}
              transition={POPUP_TRANSITION}
            >
              <DailyQueuePopup queue={queue} onClose={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
        <QueueFloatingBadge queue={queue} open={open} onClick={toggleQueue} />
      </div>
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
          <GlobalDailyReview />
          <FloatingDock />
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
      { path: '/collection/register', element: <RegisterMaterialPage /> },
      { path: '/collection/:playlistId', element: <PlaylistPage /> },
      { path: '/tips/:source/:id', element: <TipCoursePage /> },
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
            <DailyReviewProvider>
              <RouterProvider router={router} />
            </DailyReviewProvider>
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
