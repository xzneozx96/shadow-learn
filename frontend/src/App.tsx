import { Loader2 } from 'lucide-react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'
import { LessonView } from '@/components/lesson/LessonView'
import { Library } from '@/components/library/Library'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { Settings } from '@/components/settings/Settings'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LessonsProvider } from '@/contexts/LessonsContext'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { WorkbookPage } from '@/pages/WorkbookPage'
import { StudySessionPage } from '@/pages/StudySessionPage'

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
    <LessonsProvider>
      <BrowserRouter>
        <PlayerProvider>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/create" element={<CreateLesson />} />
            <Route path="/lesson/:id" element={<LessonView />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/vocabulary" element={<WorkbookPage />} />
            <Route path="/vocabulary/:lessonId/study" element={<StudySessionPage />} />
          </Routes>
        </PlayerProvider>
      </BrowserRouter>
    </LessonsProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  )
}
