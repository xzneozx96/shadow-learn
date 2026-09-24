import type { FormEvent, ReactNode } from 'react'
import type { Check, Verification } from './manifest'
import type { Notes, Phase } from './useMigration'
import type { ApiClient } from '@/db'
import type { Locale, TranslationKey } from '@/shared/lib/i18n'
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { getTranslation } from '@/shared/lib/i18n'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { useMigration } from './useMigration'

type T = (key: TranslationKey, params?: Record<string, string | number>) => string

type PluralKey
  = | 'migration.explain.lessons'
    | 'migration.explain.words'
    | 'migration.explain.media'
    | 'migration.done.stores'
    | 'migration.done.media'
    | 'migration.done.materials'
    | 'migration.done.conflicts'
    | 'migration.done.conflictMedia'
    | 'migration.done.quarantine'
    | 'migration.done.unfinished'
    | 'migration.done.orphans'
    | 'migration.done.storyless'

function plural(t: T, key: PluralKey, n: number, params: Record<string, string> = {}): string {
  return t(n === 1 ? `${key}.one` : `${key}.other`, { n, ...params })
}

const STEPS = ['explain', 'keys', 'records', 'media', 'verify', 'delete', 'done'] as const

const STEP_OF: Record<Phase['step'], typeof STEPS[number]> = {
  'explain': 'explain',
  'keys': 'keys',
  'records': 'records',
  'media': 'media',
  'verify': 'verify',
  'failed': 'verify',
  'delete': 'delete',
  'done': 'done',
  'other-account': 'explain',
  'error': 'verify',
}

function Stepper({ t, phase }: { t: T, phase: Phase }) {
  const current = STEPS.indexOf(STEP_OF[phase.step])
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={t('migration.steps')}>
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={cn(i === current ? 'font-semibold text-foreground' : i < current ? 'text-muted-foreground' : 'text-muted-foreground/50')}
        >
          {t(`migration.step.${step}`)}
        </li>
      ))}
    </ol>
  )
}

function Progress({ t, label, done, total }: { t: T, label: string, done: number, total: number }) {
  const percent = total === 0 ? 100 : Math.round((done / total) * 100)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{t('migration.progress', { done, total })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function checkLabel(t: T, check: Check): string {
  switch (check.kind) {
    case 'store':
      return check.missing > 0 ? t('migration.check.missing', { store: check.store, n: check.missing }) : check.store
    case 'quarantine':
      return t('migration.check.quarantine')
    case 'media':
      if (check.key.kind === 'shadowing')
        return t('migration.check.recording', { segment: check.key.segmentId ?? '' })
      return t(check.key.kind === 'video' ? 'migration.check.video' : 'migration.check.audio', { lesson: check.key.lessonId })
  }
}

function Results({ t, verification }: { t: T, verification: Verification }) {
  const failing = verification.checks.filter(check => !check.ok)
  const passing = verification.checks.length - failing.length
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{t('migration.failed.matched', { passing, total: verification.checks.length })}</p>
      {failing.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto" aria-label={t('migration.failed.list')}>
          {failing.map((check, i) => (

            <li key={i} className="flex items-center gap-2 text-red-400">
              <XCircle className="size-4 shrink-0" />
              {checkLabel(t, check)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function summary(t: T, verification: Verification): string {
  const stores = verification.checks.filter(check => check.kind === 'store').length
  const media = verification.checks.filter(check => check.kind === 'media').length
  return t('migration.done.summary', { stores: plural(t, 'migration.done.stores', stores), media: plural(t, 'migration.done.media', media) })
}

function noteLines(t: T, notes: Notes): string[] {
  const lines: string[] = []
  if (notes.keys.kind === 'skipped')
    lines.push(t('migration.done.keysSkipped'))
  if (notes.keys.kind === 'saved' && notes.keys.failed.length > 0)
    lines.push(t('migration.done.keysRejected', { providers: notes.keys.failed.join(', ') }))
  if (notes.keys.kind === 'saved' && notes.keys.kept.length > 0)
    lines.push(t('migration.done.keysKept', { providers: notes.keys.kept.join(', ') }))
  if (notes.keptAccountCopy > 0)
    lines.push(plural(t, 'migration.done.materials', notes.keptAccountCopy))
  if (notes.conflicts > 0)
    lines.push(plural(t, 'migration.done.conflicts', notes.conflicts))
  if (notes.keptAccountMedia > 0)
    lines.push(plural(t, 'migration.done.conflictMedia', notes.keptAccountMedia))
  if (notes.quarantined.length > 0)
    lines.push(plural(t, 'migration.done.quarantine', notes.quarantined.length, { stores: [...new Set(notes.quarantined)].sort().join(', ') }))
  if (notes.skipped.unfinishedLessons > 0)
    lines.push(plural(t, 'migration.done.unfinished', notes.skipped.unfinishedLessons))
  if (notes.skipped.orphanMedia > 0)
    lines.push(plural(t, 'migration.done.orphans', notes.skipped.orphanMedia))
  if (notes.skipped.storylessBreakdowns > 0)
    lines.push(plural(t, 'migration.done.storyless', notes.skipped.storylessBreakdowns))
  return lines
}

function needsSettings(notes: Notes): boolean {
  return notes.keys.kind === 'skipped' || (notes.keys.kind === 'saved' && notes.keys.failed.length > 0)
}

function KeysStep({ t, phase, onPin, onSkip, onConfirmSkip }: {
  t: T
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
        <p className="text-sm">{t('migration.keys.skipConfirm')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => onConfirmSkip(false)}>{t('migration.keys.back')}</Button>
          <Button variant="destructive" onClick={onSkip}>{t('migration.keys.skipConfirmButton')}</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm">{t('migration.keys.body')}</p>
      <Input type="password" inputMode="numeric" autoComplete="off" aria-label={t('migration.keys.pin')} placeholder={t('migration.keys.pin')} value={pin} onChange={e => setPin(e.target.value)} autoFocus />
      {phase.wrongPin > 0 && (
        <p role="alert" className="text-sm text-red-400">{t('migration.keys.wrong', { n: phase.wrongPin })}</p>
      )}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => onConfirmSkip(true)}>{t('migration.keys.skip')}</Button>
        <Button type="submit" disabled={phase.busy || pin === ''}>{phase.busy ? t('migration.keys.unlocking') : t('migration.keys.unlock')}</Button>
      </div>
    </form>
  )
}

function countLine(t: T, counts: Record<string, number>): string {
  const parts: [number, PluralKey][] = [
    [counts.lessons ?? 0, 'migration.explain.lessons'],
    [counts.vocabulary ?? 0, 'migration.explain.words'],
    [(counts.videos ?? 0) + (counts['shadowing-audio'] ?? 0), 'migration.explain.media'],
  ]
  return parts.filter(([n]) => n).map(([n, key]) => plural(t, key, n)).join(', ')
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {children}
    </p>
  )
}

function Exits({ t, onSignOut, onKeepLocal, onRetry }: { t: T, onSignOut: () => void, onKeepLocal: () => void, onRetry: () => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={onSignOut}>{t('migration.exit.signOut')}</Button>
      <Button variant="outline" onClick={onKeepLocal}>{t('migration.exit.keepLocal')}</Button>
      <Button onClick={onRetry}>{t('migration.exit.retry')}</Button>
    </div>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium">
      <AlertTriangle className="size-4 shrink-0 text-amber-400" />
      {children}
    </p>
  )
}

interface ModalProps {
  api: ApiClient
  account: string
  counts: Record<string, number>
  locale?: Locale
  onFinished: (path: string) => void
  onKeepLocal: () => void
  onSignOut: () => void
}

export function MigrationModal({ api, account, counts, locale, onFinished, onKeepLocal, onSignOut }: ModalProps) {
  const { phase, start, submitPin, skipKeys, confirmSkip, retry } = useMigration(api, account)
  const { locale: appLocale } = useI18n()
  const t = getTranslation(locale ?? appLocale)
  const found = countLine(t, counts)

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg" data-testid="migration-modal">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>{t('migration.title')}</DialogTitle>
            <Stepper t={t} phase={phase} />
          </div>

          {phase.step === 'explain' && (
            <>
              <DialogDescription>{t('migration.explain.body', { found: found ? `: ${found}` : '' })}</DialogDescription>
              <p className="text-sm text-muted-foreground">{t('migration.explain.merge')}</p>
              <div className="flex justify-end">
                <Button disabled={phase.busy} onClick={() => void start()}>{phase.busy ? t('migration.reading') : t('migration.start')}</Button>
              </div>
            </>
          )}

          {phase.step === 'keys' && (
            <KeysStep t={t} phase={phase} onPin={pin => void submitPin(pin)} onSkip={() => void skipKeys()} onConfirmSkip={confirmSkip} />
          )}

          {phase.step === 'records' && <Progress t={t} label={t('migration.step.records')} done={phase.done} total={phase.total} />}
          {phase.step === 'media' && <Progress t={t} label={t('migration.step.media')} done={phase.done} total={phase.total} />}
          {phase.step === 'verify' && (
            <>
              <Progress t={t} label={t('migration.step.records')} done={phase.records} total={phase.records} />
              <Progress t={t} label={t('migration.step.media')} done={phase.media} total={phase.media} />
              <Waiting>{t('migration.verifying')}</Waiting>
            </>
          )}

          {phase.step === 'failed' && (
            <>
              <Warning>{t('migration.failed.title')}</Warning>
              <Results t={t} verification={phase.verification} />
              <Exits t={t} onSignOut={onSignOut} onKeepLocal={onKeepLocal} onRetry={() => void retry()} />
            </>
          )}

          {phase.step === 'delete' && (
            <Waiting>{phase.blocked ? t('migration.delete.blocked') : t('migration.delete.running')}</Waiting>
          )}

          {phase.step === 'error' && (
            <>
              <Warning>{t('migration.error.title')}</Warning>
              <p className="text-sm text-muted-foreground">{phase.changing ? t('migration.error.changing') : phase.message}</p>
              <Exits t={t} onSignOut={onSignOut} onKeepLocal={onKeepLocal} onRetry={() => void retry()} />
            </>
          )}

          {phase.step === 'other-account' && (
            <>
              <Warning>{t('migration.otherAccount.title')}</Warning>
              <p className="text-sm text-muted-foreground">{t('migration.otherAccount.body')}</p>
              <div className="flex justify-end">
                <Button onClick={onSignOut}>{t('migration.exit.signOut')}</Button>
              </div>
            </>
          )}

          {phase.step === 'done' && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                {summary(t, phase.verification)}
              </p>
              {noteLines(t, phase.notes).map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
              <div className="flex flex-wrap justify-end gap-2">
                {needsSettings(phase.notes) && (
                  <Button variant="outline" onClick={() => onFinished('/settings')}>{t('migration.done.openSettings')}</Button>
                )}
                <Button onClick={() => onFinished('/')}>{t('migration.done.continue')}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
