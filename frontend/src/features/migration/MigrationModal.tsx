import type { FormEvent, ReactNode } from 'react'
import type { LegacyData } from './detectLegacyData'
import type { Check, Verification } from './manifest'
import type { Notes, Phase } from './useMigration'
import type { ApiClient } from '@/db'
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthContext'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { detectLegacyData } from './detectLegacyData'
import { useMigration } from './useMigration'

const STEPS = ['Explain', 'Keys', 'Records', 'Media', 'Verify', 'Delete', 'Done'] as const

const STEP_OF: Record<Phase['step'], typeof STEPS[number]> = {
  'explain': 'Explain',
  'keys': 'Keys',
  'records': 'Records',
  'media': 'Media',
  'verify': 'Verify',
  'failed': 'Verify',
  'delete': 'Delete',
  'done': 'Done',
  'other-account': 'Explain',
  'error': 'Verify',
}

function Stepper({ phase }: { phase: Phase }) {
  const current = STEPS.indexOf(STEP_OF[phase.step])
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Migration steps">
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={cn(i === current ? 'font-semibold text-foreground' : i < current ? 'text-muted-foreground' : 'text-muted-foreground/50')}
        >
          {step}
        </li>
      ))}
    </ol>
  )
}

function Progress({ label, done, total }: { label: string, done: number, total: number }) {
  const percent = total === 0 ? 100 : Math.round((done / total) * 100)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{`${done} of ${total}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function checkLabel(check: Check): string {
  switch (check.kind) {
    case 'store':
      return check.missing > 0 ? `${check.store} (${check.missing} missing)` : check.store
    case 'quarantine':
      return 'records kept aside'
    case 'media':
      return check.key.kind === 'shadowing' ? `recording ${check.key.segmentId}` : `${check.key.kind} for lesson ${check.key.lessonId}`
  }
}

function Results({ verification }: { verification: Verification }) {
  const failing = verification.checks.filter(check => !check.ok)
  const passing = verification.checks.length - failing.length
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{`${passing} of ${verification.checks.length} checks matched.`}</p>
      {failing.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto" aria-label="Failing stores">
          {failing.map((check, i) => (

            <li key={i} className="flex items-center gap-2 text-red-400">
              <XCircle className="size-4 shrink-0" />
              {checkLabel(check)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function summary(verification: Verification): string {
  const stores = verification.checks.filter(check => check.kind === 'store').length
  const media = verification.checks.filter(check => check.kind === 'media').length
  return `Verified ${stores} stores and ${media} media files. Local copy deleted.`
}

function noteLines(notes: Notes): string[] {
  const lines: string[] = []
  if (notes.keys.kind === 'skipped')
    lines.push('Your API keys were not moved. Re-enter them in Settings.')
  if (notes.keys.kind === 'saved' && notes.keys.failed.length > 0)
    lines.push(`The server did not accept your ${notes.keys.failed.join(', ')} key. Re-enter it in Settings.`)
  if (notes.keys.kind === 'saved' && notes.keys.kept.length > 0)
    lines.push(`Your account already had a ${notes.keys.kept.join(', ')} key, so it was kept.`)
  if (notes.keptAccountCopy > 0)
    lines.push(`${notes.keptAccountCopy} saved materials were already in your account, so the account's copy was kept.`)
  if (notes.quarantined > 0)
    lines.push(`${notes.quarantined} records did not fit the current format. They are kept aside on the server.`)
  if (notes.skipped.unfinishedLessons > 0)
    lines.push(`${notes.skipped.unfinishedLessons} lessons that never finished processing were not moved.`)
  if (notes.skipped.orphanMedia > 0)
    lines.push(`${notes.skipped.orphanMedia} media files belonged to no lesson and were not moved.`)
  if (notes.skipped.storylessBreakdowns > 0)
    lines.push(`${notes.skipped.storylessBreakdowns} word breakdowns had no story, so they were not moved. Breakdowns are rebuilt when you open a word.`)
  return lines
}

function needsSettings(notes: Notes): boolean {
  return notes.keys.kind === 'skipped' || (notes.keys.kind === 'saved' && notes.keys.failed.length > 0)
}

function KeysStep({ phase, onPin, onSkip, onConfirmSkip }: {
  phase: Extract<Phase, { step: 'keys' }>
  onPin: (pin: string) => void
  onSkip: () => void
  onConfirmSkip: (open: boolean) => void
}) {
  const [pin, setPin] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    onPin(pin)
    setPin('')
  }

  if (phase.confirmSkip) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Skip your keys? They stay encrypted with your old PIN and are deleted with the local copy. You can re-enter keys in Settings.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => onConfirmSkip(false)}>Back</Button>
          <Button variant="destructive" onClick={onSkip}>Skip keys</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm">Enter the PIN you used on this device to move your saved API keys to your account.</p>
      <Input type="password" inputMode="numeric" autoComplete="off" aria-label="Old PIN" placeholder="Old PIN" value={pin} onChange={e => setPin(e.target.value)} autoFocus />
      {phase.wrongPin > 0 && (
        <p role="alert" className="text-sm text-red-400">{`That PIN did not unlock your keys. Try again. (${phase.wrongPin})`}</p>
      )}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => onConfirmSkip(true)}>Skip, re-enter keys in Settings</Button>
        <Button type="submit" disabled={phase.busy || pin === ''}>{phase.busy ? 'Unlocking…' : 'Unlock keys'}</Button>
      </div>
    </form>
  )
}

function countLine(counts: Record<string, number>): string {
  const parts = [
    [counts.lessons, 'lessons'],
    [counts.vocabulary, 'saved words'],
    [(counts.videos ?? 0) + (counts['shadowing-audio'] ?? 0), 'media files'],
  ] as const
  return parts.filter(([n]) => n).map(([n, label]) => `${n} ${label}`).join(', ')
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {children}
    </p>
  )
}

interface ModalProps {
  api: ApiClient
  account: string
  counts: Record<string, number>
  onFinished: () => void
  onKeepLocal: () => void
  onSignOut: () => void
}

export function MigrationModal({ api, account, counts, onFinished, onKeepLocal, onSignOut }: ModalProps) {
  const { phase, start, submitPin, skipKeys, confirmSkip, retry } = useMigration(api, account)
  const found = countLine(counts)

  function openSettings() {
    window.history.replaceState(null, '', '/settings')
    onFinished()
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg" data-testid="migration-modal">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>Move your data to your account</DialogTitle>
            <Stepper phase={phase} />
          </div>

          {phase.step === 'explain' && (
            <>
              <DialogDescription>
                {`ShadowLearn now keeps your lessons and progress in your account. This browser still holds your earlier data${found ? `: ${found}` : ''}. We upload it, check every store and file against the server, and delete the copy in this browser only when everything matches.`}
              </DialogDescription>
              <p className="text-sm text-muted-foreground">If this account already has data from another device, counts such as total sessions add up and the account keeps its own settings.</p>
              <div className="flex justify-end">
                <Button disabled={phase.busy} onClick={() => void start()}>{phase.busy ? 'Reading…' : 'Start'}</Button>
              </div>
            </>
          )}

          {phase.step === 'keys' && (
            <KeysStep phase={phase} onPin={pin => void submitPin(pin)} onSkip={() => void skipKeys()} onConfirmSkip={confirmSkip} />
          )}

          {phase.step === 'records' && <Progress label="Records" done={phase.done} total={phase.total} />}
          {phase.step === 'media' && <Progress label="Media" done={phase.done} total={phase.total} />}
          {phase.step === 'verify' && <Waiting>Checking every store and file against the server…</Waiting>}

          {phase.step === 'failed' && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-amber-400" />
                Some data did not match the server. Nothing was deleted from this browser, and ShadowLearn asks again the next time you sign in.
              </p>
              <Results verification={phase.verification} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
                <Button variant="outline" onClick={onKeepLocal}>Use the app now, keep my local copy</Button>
                <Button onClick={() => void retry()}>Retry</Button>
              </div>
            </>
          )}

          {phase.step === 'delete' && (
            <Waiting>{phase.blocked ? 'Close other ShadowLearn tabs to finish deleting the local copy.' : 'Deleting the local copy…'}</Waiting>
          )}

          {phase.step === 'error' && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-amber-400" />
                The move stopped before it finished. Your data is still in this browser.
              </p>
              <p className="text-sm text-muted-foreground">{phase.message}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
                <Button variant="outline" onClick={onKeepLocal}>Use the app now, keep my local copy</Button>
                <Button onClick={() => void retry()}>Retry</Button>
              </div>
            </>
          )}

          {phase.step === 'other-account' && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-amber-400" />
                The data in this browser is already being moved to a different account.
              </p>
              <p className="text-sm text-muted-foreground">Sign in with the account you started with to finish. Nothing was changed.</p>
              <div className="flex justify-end">
                <Button onClick={onSignOut}>Sign out</Button>
              </div>
            </>
          )}

          {phase.step === 'done' && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-400" />
                {summary(phase.verification)}
              </p>
              {noteLines(phase.notes).map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
              <div className="flex flex-wrap justify-end gap-2">
                {needsSettings(phase.notes) && (
                  <Button variant="outline" onClick={openSettings}>Open Settings</Button>
                )}
                <Button onClick={onFinished}>Continue</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type GateState
  = | { kind: 'checking' }
    | { kind: 'import', data: LegacyData }
    | { kind: 'failed', message: string }
    | { kind: 'clear' }

export function MigrationGate({ api, children }: { api: ApiClient, children: ReactNode }) {
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
  if (state.kind === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
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
    <MigrationModal
      api={api}
      account={session?.userId ?? ''}
      counts={state.data.counts}
      onFinished={() => setState({ kind: 'clear' })}
      onKeepLocal={() => setState({ kind: 'clear' })}
      onSignOut={() => void logout()}
    />
  )
}
