import { AudioLines, BookOpenText, FileText, Library, Newspaper, PanelLeft, PanelRight, Settings, Sprout, TvMinimalPlay } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { useSpeakModal } from '@/features/speak/application/SpeakModalContext'
import { cn } from '@/shared/lib/utils'
import { useHasUnseenAnnouncement } from '@/shared/lib/whats-new'
import { AmbientBackdrop } from '@/shared/ui/AmbientBackdrop'
import { Button } from '@/shared/ui/button'
import { RadiantButton } from '@/shared/ui/RadiantButton'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t } = useI18n()
  const { trialMode } = useAuth()
  const { openSpeakModal } = useSpeakModal()
  const hasUnseen = useHasUnseenAnnouncement()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true',
  )

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const navItems = [
    { to: '/', label: t('nav.library'), icon: Library, active: location.pathname === '/' },
    { to: '/vocabulary', label: t('nav.workbook'), icon: BookOpenText, active: location.pathname.startsWith('/vocabulary') },
    { to: '/collection', label: t('nav.collection'), icon: TvMinimalPlay, active: location.pathname === '/collection' },
    { to: '/docs', label: t('nav.documentation'), icon: FileText, active: location.pathname === '/docs' },
    { to: '/changelog', label: t('whatsNew.navLabel'), icon: Newspaper, active: location.pathname === '/changelog', badge: hasUnseen },
  ]

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          'shrink-0 flex flex-col border-r backdrop-blur-xl z-50 overflow-hidden',
          'transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          collapsed ? 'w-16' : 'w-48 xl:w-56',
        )}
      >
        {trialMode && (
          <div className={cn(
            'flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/8 px-3 py-2.5 text-[12px] leading-snug text-amber-200/90',
            collapsed && 'justify-center',
          )}
          >
            <Sprout className="size-4 mt-0.5 shrink-0 text-amber-300" />
            {!collapsed && <span>{t('auth.trial.banner')}</span>}
          </div>
        )}

        {/* Logo + collapse toggle */}
        <div className={cn('flex items-center py-4', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          <Link
            to="/"
            className="group flex items-center gap-3 font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity min-w-0"
          >
            <img
              src="/favicon.svg"
              className="size-7 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:rotate-3"
              alt="ShadowLearn Logo"
            />
            {!collapsed && <span className="text-base truncate">ShadowLearn</span>}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="shrink-0 flex items-center justify-center size-7 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-white/6 transition-all duration-200"
              aria-label="Collapse sidebar"
            >
              <PanelLeft className="size-4" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <div className="flex justify-center px-2 pb-1">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex items-center justify-center size-7 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-white/6 transition-all duration-200"
              aria-label="Expand sidebar"
            >
              <PanelRight className="size-4" />
            </button>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-3 px-3 py-3">
          {navItems.map(({ to, label, icon: Icon, active, badge }) => (
            <div key={to} className="group relative">
              <Button
                variant="ghost"
                nativeButton={false}
                title={collapsed ? label : undefined}
                className={cn(
                  'w-full h-10 rounded-lg text-sm font-medium',
                  'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  collapsed ? 'justify-center px-0 gap-0' : 'justify-start gap-3 px-3',
                  active
                    ? 'bg-primary! text-primary-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/6',
                )}
                render={<Link to={to} />}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    !active && 'group-hover:scale-110',
                  )}
                />
                {!collapsed && label}
              </Button>
              {badge && (
                <span className={cn(
                  'pointer-events-none absolute flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm ring-2 ring-background',
                  collapsed ? 'top-0.5 right-0.5' : 'top-1.5 right-1.5',
                )}
                >
                  1
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/6 p-3 flex flex-col gap-2">
          {/* AI Companion CTA — temporarily disabled. GlobalCompanion needs a clearer purpose; revisit. */}
          {/* <RadiantButton
            onClick={openPanel}
            title={collapsed ? t('companion.askButton') : undefined}
            color="#fbbf24"
            background="rgba(251, 191, 36, 0.06)"
            className="group w-full h-11"
            innerClassName={cn(
              'h-full',
              collapsed ? 'justify-center px-0' : 'justify-start gap-2.5 px-3',
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-amber-400/20 ring-1 ring-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] shrink-0">
              <Sparkles className="size-4 text-amber-300 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-12 group-hover:scale-110" />
            </span>
            {!collapsed && <span className="text-sm font-semibold text-amber-100/95">{t('companion.askButton')}</span>}
          </RadiantButton> */}

          {/* Speak Practice CTA */}
          <RadiantButton
            onClick={openSpeakModal}
            title={collapsed ? t('speak.title') : undefined}
            color="hsl(var(--primary))"
            background="hsl(var(--primary) / 0.08)"
            className="group w-full h-11"
            innerClassName={cn(
              'h-full',
              collapsed ? 'justify-center px-0' : 'justify-start gap-2.5 px-3',
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/20 ring-1 ring-primary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shrink-0">
              <AudioLines className="size-4 text-primary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110" />
            </span>
            {!collapsed && <span className="text-sm font-semibold text-foreground">{t('speak.title')}</span>}
          </RadiantButton>

          {/* Settings */}
          <Button
            variant="ghost"
            nativeButton={false}
            title={collapsed ? t('nav.settings') : undefined}
            className={cn(
              'group w-full h-9 text-sm font-medium text-foreground/60 hover:text-foreground/70 hover:bg-white/4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              collapsed ? 'justify-center px-0 gap-0' : 'justify-start gap-3 px-3',
            )}
            render={<Link to="/settings" />}
          >
            <Settings className="size-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-45" />
            {!collapsed && t('nav.settings')}
          </Button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 min-w-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          <AmbientBackdrop tone="violet" />
          {children}
        </main>
      </div>
    </div>
  )
}
