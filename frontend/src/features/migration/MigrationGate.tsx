import type { ReactNode } from 'react'
import type { LegacyData } from './detectLegacyData'
import type { ApiClient } from '@/db'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { prefetchedAbsent, takeLegacyData } from './prefetchLegacyData'

const MigrationModal = lazy(() => import('./MigrationModal').then(module => ({ default: module.MigrationModal })))

function Checking() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

type GateState
  = | { kind: 'checking' }
    | { kind: 'import', data: LegacyData }
    | { kind: 'failed' }
    | { kind: 'clear' }

interface GateProps {
  api: ApiClient
  children: ReactNode
  /** Load the app fresh, so providers outside the gate, such as I18nProvider, read the imported settings. */
  openApp?: (path: string) => void
}

export function MigrationGate({ api, children, openApp = path => window.location.assign(path) }: GateProps) {
  const { session, logout } = useAuth()
  const { t } = useI18n()
  const [state, setState] = useState<GateState>(() => prefetchedAbsent() ? { kind: 'clear' } : { kind: 'checking' })

  const check = useCallback(() => {
    let live = true
    takeLegacyData().then(
      (data) => {
        if (live)
          setState(data.present ? { kind: 'import', data } : { kind: 'clear' })
      },
      (err: unknown) => {
        console.warn('[migration] could not read the legacy data', err)
        if (live)
          setState({ kind: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(check, [check])

  if (state.kind === 'clear')
    return children
  if (state.kind === 'checking')
    return <Checking />
  if (state.kind === 'failed') {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg" data-testid="migration-modal">
          <DialogTitle>{t('migration.title')}</DialogTitle>
          <DialogDescription>{t('migration.error.unreadable')}</DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => void logout()}>{t('migration.exit.signOut')}</Button>
            <Button variant="outline" onClick={() => setState({ kind: 'clear' })}>{t('migration.exit.keepLocal')}</Button>
            <Button onClick={() => {
              setState({ kind: 'checking' })
              check()
            }}
            >
              {t('migration.exit.retry')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Suspense fallback={<Checking />}>
      <MigrationModal
        api={api}
        account={session?.userId ?? ''}
        counts={state.data.counts}
        locale={state.data.locale}
        onFinished={openApp}
        onKeepLocal={() => setState({ kind: 'clear' })}
        onSignOut={() => void logout()}
      />
    </Suspense>
  )
}
