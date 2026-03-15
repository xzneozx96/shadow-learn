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
    <div className="h-screen glass-bg text-foreground">
      <nav className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-background/50 px-4 py-2.5 backdrop-blur-md">
        <Link to="/" className="text-lg font-bold tracking-tight text-foreground">
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
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/vocabulary" />}
            className={location.pathname.startsWith('/vocabulary') ? 'bg-accent' : undefined}
          >
            Workbook
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
