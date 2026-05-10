import { BookOpen, FileText, Library, Newspaper, Play, Settings, Sparkles, Sprout, Zap } from 'lucide-react'
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
    { to: '/collection', label: t('nav.collection'), icon: Play, active: location.pathname === '/collection' },
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
            <Sprout className="size-4 mt-0.5 shrink-0 text-amber-300" />
            <span>{t('auth.trial.banner')}</span>
          </div>
        )}

        {/* Logo */}
        <div className="px-4 py-4">
          <Link
            to="/"
            className="group flex items-center gap-3 font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity"
          >
            <img
              src="/favicon.svg"
              className="size-7 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:rotate-3"
              alt="ShadowLearn Logo"
            />
            <span className="text-base">ShadowLearn</span>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-3 px-3 py-3">
          {navItems.map(({ to, label, icon: Icon, active, badge }) => (
            <div key={to} className="group relative">
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start gap-3 h-10 rounded-lg px-3 text-sm font-medium',
                  active
                    ? 'bg-primary! text-primary-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/6',
                  'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                )}
                render={<Link to={to} />}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    !active && 'group-hover:scale-110 group-hover:translate-x-0.5',
                  )}
                />
                {label}
              </Button>
              {badge && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm ring-2 ring-background">
                  1
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/6 p-3 flex flex-col gap-2">
          {/* AI Companion CTA — amber treatment */}
          <button
            type="button"
            onClick={openPanel}
            className="group relative w-full h-11 px-2.5 rounded-lg bg-linear-to-br from-amber-400/10 to-amber-500/5 border border-amber-400/20 animate-breathe-amber hover:from-amber-400/15 hover:to-amber-500/10 hover:border-amber-400/35 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] flex items-center gap-2.5 cursor-pointer"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-amber-400/20 ring-1 ring-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] shrink-0">
              <Sparkles className="size-4 text-amber-300 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-12 group-hover:scale-110" />
            </span>
            <span className="text-sm font-semibold text-amber-100/95">{t('companion.askButton')}</span>
          </button>

          {/* Speak Practice CTA — primary treatment */}
          <button
            type="button"
            onClick={openSpeakModal}
            className="group relative w-full h-11 px-2.5 rounded-lg bg-linear-to-br from-primary/12 to-primary/5 border border-primary/25 animate-breathe-primary hover:from-primary/18 hover:to-primary/8 hover:border-primary/40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] flex items-center gap-2.5 cursor-pointer"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/20 ring-1 ring-primary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shrink-0">
              <Zap className="size-4 text-primary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:-translate-y-0.5" />
            </span>
            <span className="text-sm font-semibold text-foreground">{t('speak.title')}</span>
          </button>

          {/* Settings — utility row */}
          <Button
            variant="ghost"
            className="group w-full justify-start gap-3 h-9 px-3 text-sm font-medium text-foreground/60 hover:text-foreground/70 hover:bg-white/4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            render={<Link to="/settings" />}
          >
            <Settings className="size-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-45" />
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
