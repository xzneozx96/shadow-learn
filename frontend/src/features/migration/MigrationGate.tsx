import type { ReactNode } from 'react'
import type { LegacyData } from './detectLegacyData'
import type { ApiClient } from '@/db'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { detectLegacyData } from './detectLegacyData'

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
    | { kind: 'failed', message: string }
    | { kind: 'clear' }

interface GateProps {
  api: ApiClient
  children: ReactNode
  /** Load the app fresh, so providers outside the gate, such as I18nProvider, read the imported settings. */
  openApp?: (path: string) => void
}

export function MigrationGate({ api, children, openApp = path => window.location.assign(path) }: GateProps) {
  const { session, logout } = useAuth()
  const [state, setState] = useState<GateState>({ kind: 'checking' })

  const detect = useCallback(() => {
    let live = true
    detectLegacyData().then(
      (data) => {
        if (live)
          setState(data.present ? { kind: 'import', data } : { kind: 'clear' })
      },
      (err: unknown) => {
        if (live)
          setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) })
      },
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(detect, [detect])

  if (state.kind === 'clear')
    return children
  if (state.kind === 'checking')
    return <Checking />
  if (state.kind === 'failed') {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg" data-testid="migration-modal">
          <DialogTitle>Move your data to your account</DialogTitle>
          <DialogDescription>{`This browser holds earlier ShadowLearn data, but it could not be read: ${state.message}`}</DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => void logout()}>Sign out</Button>
            <Button variant="outline" onClick={() => setState({ kind: 'clear' })}>Use the app now, keep my local copy</Button>
            <Button onClick={() => {
              setState({ kind: 'checking' })
              detect()
            }}
            >
              Retry
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
        onFinished={openApp}
        onKeepLocal={() => setState({ kind: 'clear' })}
        onSignOut={() => void logout()}
      />
    </Suspense>
  )
}
