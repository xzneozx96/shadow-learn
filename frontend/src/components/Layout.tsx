import { Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { ScrollArea } from './ui/scroll-area'

interface LayoutProps {
  children: React.ReactNode
  onSearch?: (query: string) => void
  searchValue?: string
}

export function Layout({ children, onSearch, searchValue }: LayoutProps) {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const { t } = useI18n()
  const { trialMode } = useAuth()

  return (
    <div className="h-screen flex flex-col text-foreground glass-bg">
      {trialMode && (
        <div className="bg-yellow-500/10 text-yellow-500 text-center text-xs py-1.5 border-b border-yellow-500/20 backdrop-blur-md">
          {t('auth.trial.banner')}
        </div>
      )}
      <nav className="z-50 flex items-center gap-3 border-b border-border bg-background/50 px-4 py-3 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity">
          <img src="/favicon.svg" className="size-5" alt="ShadowLearn Logo" />
          <span className="text-lg">ShadowLearn</span>
        </Link>

        {isHome && onSearch && (
          <Input
            placeholder={t('nav.search')}
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
            {t('nav.documentation')}
          </Button>
          <Button
            variant={location.pathname.startsWith('/vocabulary') ? 'default' : 'outline'}
            size="sm"
            render={<Link to="/vocabulary" />}
          >
            {t('nav.workbook')}
          </Button>
          <Button variant="outline" size="icon" render={<Link to="/settings" />}>
            <Settings className="size-4" />
          </Button>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {children}
        </ScrollArea>
      </main>
    </div>
  )
}
