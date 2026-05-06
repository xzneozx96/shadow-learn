import { Settings, Sparkles, Zap } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { GlobalCompanionPanel } from '@/components/chat/GlobalCompanionPanel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useGlobalCompanionContext } from '@/contexts/GlobalCompanionContext'
import { useI18n } from '@/contexts/I18nContext'
import { useSpeakModal } from '@/contexts/SpeakModalContext'
import { cn } from '@/lib/utils'
import { useHasUnseenAnnouncement } from '@/lib/whats-new'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t } = useI18n()
  const { trialMode } = useAuth()
  const { isGlobalPanelOpen, openPanel } = useGlobalCompanionContext()
  const { openSpeakModal } = useSpeakModal()
  const hasUnseen = useHasUnseenAnnouncement()

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col text-foreground">
        {trialMode && (
          <div className="bg-yellow-500/10 text-yellow-500 text-center text-xs py-1.5 border-b border-yellow-500/20 backdrop-blur-md">
            {t('auth.trial.banner')}
          </div>
        )}
        <nav className="z-50 border-b border-white/6 bg-background/75 px-4 py-3 backdrop-blur-xl shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)]">
          <div className="container mx-auto flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex shrink-0 justify-start">
              <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity">
                <img src="/favicon.svg" className="size-7" alt="ShadowLearn Logo" />
                <span className="text-base hidden xl:inline-block">ShadowLearn</span>
              </Link>
            </div>

            {/* Navigation — flat text links, no pill wrapper */}
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-card p-1 shadow-xs backdrop-blur-md">
              <Button
                variant={location.pathname === '/' ? 'secondary' : 'ghost'}
                className={cn('rounded-full h-9', location.pathname === '/' ? 'bg-primary! shadow-md text-primary-foreground' : 'text-foreground/70 hover:text-foreground hover:bg-background/50')}
                render={<Link to="/" />}
              >
                {t('nav.library')}
              </Button>
              <Button
                variant={location.pathname.startsWith('/vocabulary') ? 'secondary' : 'ghost'}
                className={cn('rounded-full h-9', location.pathname.startsWith('/vocabulary') ? 'bg-primary! shadow-md text-primary-foreground' : 'text-foreground/70 hover:text-foreground hover:bg-background/50')}
                render={<Link to="/vocabulary" />}
              >
                {t('nav.workbook')}
              </Button>
              <Button
                variant={location.pathname === '/docs' ? 'secondary' : 'ghost'}
                className={cn('rounded-full h-9', location.pathname === '/docs' ? 'bg-primary! shadow-md text-primary-foreground' : 'text-foreground/70 hover:text-foreground hover:bg-background/50')}
                render={<Link to="/docs" />}
              >
                {t('nav.documentation')}
              </Button>
              <div className="relative">
                <Button
                  variant={location.pathname === '/changelog' ? 'secondary' : 'ghost'}
                  className={cn('rounded-full h-9', location.pathname === '/changelog' ? 'bg-primary! shadow-md text-primary-foreground' : 'text-foreground/70 hover:text-foreground hover:bg-background/50')}
                  render={<Link to="/changelog" />}
                >
                  {t('whatsNew.navLabel')}
                </Button>
                {hasUnseen && (
                  <span className="pointer-events-none absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background">
                    1
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 justify-end items-center gap-1.5">
              <Button
                variant="outline"
                onClick={openPanel}
                className="gap-2 h-9 border-white/8 bg-white/4 hover:bg-white/8 text-amber-400/80 hover:text-amber-400 transition-colors"
              >
                <Sparkles className="size-3.5" />
                <span className="hidden xl:inline text-sm">{t('companion.askButton')}</span>
              </Button>
              <Button
                variant="outline"
                onClick={openSpeakModal}
                className="gap-2 h-9 border-primary/25 bg-primary/6 hover:bg-primary/15 text-primary transition-colors"
              >
                <Zap className="size-3.5" />
                <span className="hidden xl:inline text-sm">{t('speak.title')}</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/8 bg-transparent hover:bg-white/6 text-foreground/50 hover:text-foreground transition-colors"
                render={<Link to="/settings" />}
              >
                <Settings className="size-4" />
              </Button>
            </div>
          </div>
        </nav>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
      {isGlobalPanelOpen ? <GlobalCompanionPanel /> : null}
    </div>
  )
}
