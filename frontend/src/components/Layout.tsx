import { BookOpen, FileText, Library, Newspaper, Settings, Sparkles, Sprout, Zap } from 'lucide-react'
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

  const navItems = [
    { to: '/', label: t('nav.library'), icon: Library, active: location.pathname === '/' },
    { to: '/vocabulary', label: t('nav.workbook'), icon: BookOpen, active: location.pathname.startsWith('/vocabulary') },
    { to: '/docs', label: t('nav.documentation'), icon: FileText, active: location.pathname === '/docs' },
    { to: '/changelog', label: t('whatsNew.navLabel'), icon: Newspaper, active: location.pathname === '/changelog', badge: hasUnseen },
  ]

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-48 xl:w-56 shrink-0 flex flex-col border-r border backdrop-blur-xl z-50">
        {trialMode && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/8 px-3 py-2.5 text-[12px] leading-snug text-amber-200/90">
            <Sprout className="size-3.5 mt-0.5 shrink-0 text-amber-300" />
            <span>{t('auth.trial.banner')}</span>
          </div>
        )}

        {/* Logo */}
        <div className="px-4 py-4">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity">
            <img src="/favicon.svg" className="size-7" alt="ShadowLearn Logo" />
            <span className="text-base">ShadowLearn</span>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-3 px-3 py-3">
          {navItems.map(({ to, label, icon: Icon, active, badge }) => (
            <div key={to} className="relative">
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start gap-3 h-10 rounded-lg px-3 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary! text-primary-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/6',
                  'transition-all duration-200 ease-out',
                )}
                render={<Link to={to} />}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Button>
              {badge && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background">
                  1
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/6 p-3 flex flex-col gap-3">
          <Button
            onClick={openPanel}
            className="w-full justify-start gap-3 h-10 px-3 text-sm font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/25 hover:border-amber-400/40 shadow-sm transition-colors"
            variant="ghost"
          >
            <Sparkles className="size-4 shrink-0" />
            {t('companion.askButton')}
          </Button>
          <Button
            onClick={openSpeakModal}
            className="w-full justify-start gap-3 h-10 px-3 text-sm font-medium bg-primary/15 hover:bg-primary/25 text-primary hover:text-primary border border-primary/25 hover:border-primary/50 shadow-sm transition-colors"
            variant="ghost"
          >
            <Zap className="size-4 shrink-0" />
            {t('speak.title')}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-9 px-3 text-sm text-foreground/40 hover:text-foreground hover:bg-white/6 transition-colors"
            render={<Link to="/settings" />}
          >
            <Settings className="size-3.5 shrink-0" />
            {t('nav.settings')}
          </Button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 min-w-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          {children}
        </main>
        {isGlobalPanelOpen ? <GlobalCompanionPanel /> : null}
      </div>
    </div>
  )
}
