import { Loader2 } from 'lucide-react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { FeedbackButton } from '@/components/FeedbackButton'
import { LessonView } from '@/components/lesson/LessonView'
import { Library } from '@/components/library/Library'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { Settings } from '@/components/settings/Settings'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { GlobalCompanionProvider } from '@/contexts/GlobalCompanionContext'
import { I18nProvider } from '@/contexts/I18nContext'
import { LessonsProvider } from '@/contexts/LessonsContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { VocabularyProvider } from '@/contexts/VocabularyContext'
import { DocumentationPage } from '@/pages/DocumentationPage'
import { StudySessionPage } from '@/pages/StudySessionPage'
import { WorkbookPage } from '@/pages/WorkbookPage'

function AppLayout() {
  return (
    <PlayerProvider>
      <GlobalCompanionProvider>
        <Outlet />
        <FeedbackButton />
      </GlobalCompanionProvider>
    </PlayerProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Library /> },
      { path: '/create', element: <CreateLesson /> },
      { path: '/docs', element: <DocumentationPage /> },
      { path: '/lesson/:id', element: <LessonView /> },
      { path: '/settings', element: <Settings /> },
      { path: '/vocabulary', element: <WorkbookPage /> },
      { path: '/vocabulary/:lessonId/study', element: <StudySessionPage /> },
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
          <RouterProvider router={router} />
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
