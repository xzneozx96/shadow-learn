import { Loader2 } from 'lucide-react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Setup } from '@/components/onboarding/Setup'
import { Unlock } from '@/components/onboarding/Unlock'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

function Placeholder({ name }: { name: string }) {
  return (
    <div className="p-8 text-slate-300">
      {name}
      {' '}
      -- coming soon
    </div>
  )
}

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
      <Layout>
        <Routes>
          <Route path="/" element={<Placeholder name="Library" />} />
          <Route path="/create" element={<Placeholder name="Create Lesson" />} />
          <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
        </Routes>
      </Layout>
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
