import { Settings } from 'lucide-react'
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
    <div className="h-screen glass-bg text-foreground">
      <nav className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-background/50 px-4 py-3 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity">
          <img src="/favicon.svg" className="size-5" alt="ShadowLearn Logo" />
          <span className="text-lg">ShadowLearn</span>
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
          <Button
            variant={location.pathname === '/docs' ? 'default' : 'outline'}
            size="sm"
            render={<Link to="/docs" />}
          >
            Documentation
          </Button>
          <Button
            variant={location.pathname.startsWith('/vocabulary') ? 'default' : 'outline'}
            size="sm"
            render={<Link to="/vocabulary" />}
          >
            Workbook
          </Button>
          <Button variant="outline" size="icon" render={<Link to="/settings" />}>
            <Settings className="size-4" />
          </Button>
        </div>
      </nav>

      <main>{children}</main>
    </div>
  )
}
