import { Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router-dom'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { ErrorScreen } from '@/app/ErrorScreen'
import { Setup } from '@/app/onboarding/Setup'
import { Unlock } from '@/app/onboarding/Unlock'
import { ChangelogPage } from '@/app/pages/ChangelogPage'
import { DocumentationPage } from '@/app/pages/DocumentationPage'
import { WorkbookPage } from '@/app/pages/WorkbookPage'
import { AuthProvider, useAuth } from '@/app/providers/AuthContext'
import { I18nProvider } from '@/app/providers/I18nContext'
import { PlayerProvider } from '@/app/providers/PlayerContext'
import { GlobalCompanionProvider, useGlobalCompanionContext } from '@/features/agent/application/GlobalCompanionContext'
import { CompanionFloatingButton } from '@/features/agent/ui/chat/CompanionFloatingButton'
import { GlobalCompanionPanel } from '@/features/agent/ui/chat/GlobalCompanionPanel'
import { CollectionPage } from '@/features/learning-materials/ui/CollectionPage'
import { PlaylistPage } from '@/features/learning-materials/ui/PlaylistPage'
import { RegisterMaterialPage } from '@/features/learning-materials/ui/RegisterMaterialPage'
import { TipCoursePage } from '@/features/learning-materials/ui/TipCoursePage'
import { LessonsProvider } from '@/features/lesson/application/LessonsContext'
import { CreateLesson } from '@/features/lesson/ui/create/CreateLesson'
import { LessonView } from '@/features/lesson/ui/LessonView'
import { Library } from '@/features/lesson/ui/library/Library'
import { Settings } from '@/features/settings/ui/Settings'
import { SpeakModalProvider, useSpeakModal } from '@/features/speak/application/SpeakModalContext'
import { PracticeSpeakingModal } from '@/features/speak/ui/PracticeSpeakingModal'
import { DailyReviewProvider, useDailyReview } from '@/features/study/application/DailyReviewContext'
import { StudyQueueProvider, useStudyQueueContext } from '@/features/study/application/StudyQueueContext'
import { DailyQueuePopup } from '@/features/study/ui/queue/DailyQueuePopup'
import { DailyReviewModal } from '@/features/study/ui/queue/DailyReviewModal'
import { QueueFloatingBadge } from '@/features/study/ui/queue/QueueFloatingBadge'
import { VocabularyProvider } from '@/features/vocabulary/application/VocabularyContext'
import { todayISO } from '@/shared/lib/date'
import { Toaster } from '@/shared/ui/sonner'

// Lazy-loaded: pulls in `hanzi` (~7.7 MB dictionary) only when user enters study flow.
const StudySessionPage = lazy(() =>
  import('@/features/study/ui/StudySessionPage').then(m => ({ default: m.StudySessionPage })),
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
