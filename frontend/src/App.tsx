import { Loader2 } from 'lucide-react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CreateLesson } from '@/components/create/CreateLesson'
import { LessonView } from '@/components/lesson/LessonView'
import { Library } from '@/components/library/Library'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { Settings } from '@/components/settings/Settings'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { PlayerProvider } from '@/contexts/PlayerContext'

function AuthGate() {
  const { isFirstSetup, isUnlocked } = useAuth()

  // Loading state
  if (isFirstSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Loader2 className="size-8 animate-spin text-slate-400" />
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
    <BrowserRouter>
      <PlayerProvider>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/create" element={<CreateLesson />} />
          <Route path="/lesson/:id" element={<LessonView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </PlayerProvider>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
