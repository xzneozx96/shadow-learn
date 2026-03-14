import { Plus, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LayoutProps {
  children: React.ReactNode
  onSearch?: (query: string) => void
  searchValue?: string
}

export function Layout({ children, onSearch, searchValue }: LayoutProps) {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <nav className="sticky top-0 z-50 flex items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm">
        <Link to="/" className="text-lg font-bold tracking-tight text-slate-100">
          ShadowLearn
        </Link>

        {isHome && onSearch && (
          <Input
            placeholder="Search lessons..."
            value={searchValue ?? ''}
            onChange={e => onSearch(e.target.value)}
            className="ml-2 max-w-xs"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link to="/create" />}>
            <Plus className="size-4" />
            New Lesson
          </Button>
          <Button variant="ghost" size="icon" render={<Link to="/settings" />}>
            <Settings className="size-4" />
          </Button>
        </div>
      </nav>

      <main>{children}</main>
    </div>
  )
}
