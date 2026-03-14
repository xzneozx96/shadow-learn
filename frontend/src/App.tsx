import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'

function Placeholder({ name }: { name: string }) {
  return (
    <div className="p-8 text-white">
      {name}
      {' '}
      — coming soon
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Placeholder name="Library" />} />
          <Route path="/create" element={<Placeholder name="Create Lesson" />} />
          <Route path="/lesson/:id" element={<Placeholder name="Lesson View" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
