import { AudioLines, BookOpenText, FileText, Library, LogOut, Menu, Newspaper, PanelLeft, PanelRight, Plus, Settings, TvMinimalPlay, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { useSpeakModal } from '@/features/speak/application/SpeakModalContext'
import { cn } from '@/shared/lib/utils'
import { useHasUnseenAnnouncement } from '@/shared/lib/whats-new'
import { AmbientBackdrop } from '@/shared/ui/AmbientBackdrop'
import { BrandLogo } from '@/shared/ui/BrandLogo'
import { Button } from '@/shared/ui/button'
import { RadiantButton } from '@/shared/ui/RadiantButton'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t } = useI18n()
  const { logout } = useAuth()
  const { openSpeakModal } = useSpeakModal()
  const hasUnseen = useHasUnseenAnnouncement()
  const focusedStudy = location.pathname.startsWith('/lesson/') || location.pathname.endsWith('/study')

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true',
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen)
      return
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape')
        setMobileOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [mobileOpen])

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
    <div className="flex h-dvh flex-col overflow-hidden text-foreground md:flex-row">
      <header className={cn('z-40 h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl md:hidden', focusedStudy ? 'hidden' : 'flex')}>
        <Link to="/" aria-label={t('nav.library')}>
          <BrandLogo size="sm" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-white/6"
          aria-label={t('nav.openNavigation')}
          aria-expanded={mobileOpen}
          aria-controls="app-navigation"
        >
          <Menu className="size-5" />
        </button>
      </header>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={t('nav.closeNavigation')}
        />
      )}
      {/* Sidebar */}
      <aside
        id="app-navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-background/95 backdrop-blur-xl md:relative md:inset-auto md:bg-transparent',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:transition-[width]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'md:w-16' : 'md:w-48 xl:w-56',
        )}
      >
        {/* Logo + collapse toggle */}
        <div className={cn('flex items-center py-4', collapsed ? 'justify-between px-4 md:justify-center md:px-2' : 'justify-between px-4')}>
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="group flex items-center gap-3 font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity min-w-0"
          >
            <BrandLogo compact={collapsed && !mobileOpen} size="sm" className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105" />
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="flex size-8 items-center justify-center rounded-md md:hidden" aria-label={t('nav.closeNavigation')}>
            <X className="size-5" />
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden shrink-0 items-center justify-center size-7 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-white/6 transition-all duration-200 md:flex"
              aria-label="Collapse sidebar"
            >
              <PanelLeft className="size-4" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <div className="hidden justify-center px-2 pb-1 md:flex">
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
                  collapsed ? 'justify-start gap-3 px-3 md:justify-center md:px-0 md:gap-0' : 'justify-start gap-3 px-3',
                  active
                    ? 'bg-primary! text-primary-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/6',
                )}
                render={<Link to={to} onClick={() => setMobileOpen(false)} />}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    !active && 'group-hover:scale-110',
                  )}
                />
                <span className={collapsed ? 'md:hidden' : undefined}>{label}</span>
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
              collapsed ? 'justify-start gap-2.5 px-3 md:justify-center md:px-0 md:gap-0' : 'justify-start gap-2.5 px-3',
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/20 ring-1 ring-primary/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] shrink-0">
              <AudioLines className="size-4 text-primary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110" />
            </span>
            <span className={cn('text-sm font-semibold text-foreground', collapsed && 'md:hidden')}>{t('speak.title')}</span>
          </RadiantButton>

          {/* Settings */}
          <Button
            variant="ghost"
            nativeButton={false}
            title={collapsed ? t('nav.settings') : undefined}
            className={cn(
              'group w-full h-9 text-sm font-medium text-foreground/60 hover:text-foreground/70 hover:bg-white/4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              collapsed ? 'justify-start gap-3 px-3 md:justify-center md:px-0 md:gap-0' : 'justify-start gap-3 px-3',
            )}
            render={<Link to="/settings" onClick={() => setMobileOpen(false)} />}
          >
            <Settings className="size-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-45" />
            <span className={collapsed ? 'md:hidden' : undefined}>{t('nav.settings')}</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => void logout()}
            title={collapsed ? t('account.logout') : undefined}
            className={cn(
              'w-full h-9 text-sm font-medium text-destructive hover:text-destructive hover:bg-destructive/10! transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              collapsed ? 'justify-start gap-3 px-3 md:justify-center md:px-0 md:gap-0' : 'justify-start gap-3 px-3',
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span className={collapsed ? 'md:hidden' : undefined}>{t('account.logout')}</span>
          </Button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <main className="h-full min-w-0 flex-1 overflow-hidden">
          <AmbientBackdrop tone="violet" />
          {children}
        </main>
      </div>
      {!focusedStudy && (
        <nav className="z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label={t('nav.mobileNavigation')}>
          {[
            { to: '/', label: t('nav.library'), icon: Library, active: location.pathname === '/' },
            { to: '/create', label: t('nav.create'), icon: Plus, active: location.pathname === '/create' },
            { to: '/vocabulary', label: t('nav.workbook'), icon: BookOpenText, active: location.pathname.startsWith('/vocabulary') },
            { to: '/collection', label: t('nav.collection'), icon: TvMinimalPlay, active: location.pathname === '/collection' },
          ].map(({ to, label, icon: Icon, active }) => (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cn('flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
