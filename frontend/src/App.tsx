import { Loader2 } from 'lucide-react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'
import { LessonView } from '@/components/lesson/LessonView'
import { Library } from '@/components/library/Library'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { Settings } from '@/components/settings/Settings'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
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
      <Outlet />
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
  const { isFirstSetup, isUnlocked } = useAuth()

  // Loading state
  if (isFirstSetup === null) {
    return (
      <div className="flex h-screen items-center justify-center glass-bg">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // First launch -- set up keys
  if (isFirstSetup) {
    return <Setup />
  }

  // Keys exist but locked
  if (!isUnlocked) {
    return <Unlock />
  }

  // Authenticated -- show app
  return (
    <VocabularyProvider>
      <LessonsProvider>
        <RouterProvider router={router} />
      </LessonsProvider>
    </VocabularyProvider>
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
