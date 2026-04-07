import { Newspaper, Settings, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { GlobalCompanionPanel } from '@/components/chat/GlobalCompanionPanel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { useHasUnseenAnnouncement } from '@/lib/whats-new'
import { ScrollArea } from './ui/scroll-area'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t } = useI18n()
  const { trialMode } = useAuth()
  const { isGlobalPanelOpen, openPanel } = useGlobalCompanionContext()
  const hasUnseen = useHasUnseenAnnouncement()

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col text-foreground">
        {trialMode && (
          <div className="bg-yellow-500/10 text-yellow-500 text-center text-xs py-1.5 border-b border-yellow-500/20 backdrop-blur-md">
            {t('auth.trial.banner')}
          </div>
        )}
        <nav className="z-50 border-b border-border bg-background p-4 backdrop-blur-md">
          <div className="container mx-auto flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity">
              <img src="/favicon.svg" className="size-5" alt="ShadowLearn Logo" />
              <span className="text-lg">ShadowLearn</span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openPanel} className="gap-1.5">
                <Sparkles className="size-3.5" />
                {t('companion.askButton')}
              </Button>
              <Button
                variant={location.pathname.startsWith('/vocabulary') ? 'default' : 'outline'}
                size="sm"
                render={<Link to="/vocabulary" />}
              >
                {t('nav.workbook')}
              </Button>
              <Button
                variant={location.pathname === '/docs' ? 'default' : 'outline'}
                size="sm"
                render={<Link to="/docs" />}
              >
                {t('nav.documentation')}
              </Button>
              <div className="relative">
                <Button
                  variant={location.pathname === '/changelog' ? 'default' : 'outline'}
                  size="sm"
                  render={<Link to="/changelog" />}
                  className="gap-1.5"
                >
                  <Newspaper className="size-3.5" />
                  {t('whatsNew.navLabel')}
                </Button>
                {hasUnseen && (
                  <span className="pointer-events-none absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    1
                  </span>
                )}
              </div>
              <Button variant="outline" size="icon" render={<Link to="/settings" />}>
                <Settings className="size-4" />
              </Button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {children}
          </ScrollArea>
        </main>
      </div>
      {isGlobalPanelOpen ? <GlobalCompanionPanel /> : null}
    </div>
  )
}
