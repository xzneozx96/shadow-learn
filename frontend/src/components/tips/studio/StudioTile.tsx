import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TranslationKey } from '@/lib/i18n'
import { Loader2, Lock } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  Icon: LucideIcon
  titleKey: TranslationKey
  blurbKey: TranslationKey
  state: 'empty' | 'filled' | 'locked' | 'disabled'
  badge?: string
  preview?: string | null
  primaryLabel?: string
  onPrimary?: () => void
  onRegen?: () => void
  busy?: boolean
  busyLabel?: string
  errorLabel?: string
  loading?: boolean
  loadingLabel?: string
  children?: ReactNode
}

export function StudioTile({
  Icon,
  titleKey,
  blurbKey,
  state,
  badge,
  primaryLabel,
  onPrimary,
  onRegen,
  busy,
  busyLabel,
  errorLabel,
  loading,
  loadingLabel,
  children,
}: Props) {
  const { t } = useI18n()
  const title = t(titleKey)
  const blurb = t(blurbKey)
  const isLocked = state === 'locked'
  const isDisabled = state === 'disabled'

  return (
    <div
      data-tile
      data-locked={isLocked ? 'true' : 'false'}
      className={[
        'flex flex-col gap-2 rounded-xl border bg-card p-3 min-h-44 transition-colors',
        isLocked ? 'opacity-50' : '',
        state === 'filled' ? 'border-primary/30 bg-linear-to-b from-primary/6 to-card' : 'border-border',
        isDisabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="size-7 rounded-md bg-primary/15 text-primary flex items-center justify-center relative">
        <Icon className="size-4" />
        {isLocked && <Lock className="absolute -bottom-1 -right-1 size-3" />}
      </div>
      <div className="mt-2">
        <h3 className="text-sm font-bold text-foreground leading-tight flex items-center gap-1.5">
          {title}
          {badge && (
            <span className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full font-bold">{badge}</span>
          )}
        </h3>
        <p className="text-xs text-muted-foreground leading-snug mt-1">{blurb}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {!isLocked && primaryLabel && onPrimary && (() => {
          // Opening a filled tile reads cached IDB data — zero cost.
          // Only block primary button when it would fire a network call (empty state).
          const primaryBlocked = isDisabled || loading || (busy && state !== 'filled')
          return (
            <button
              type="button"
              disabled={primaryBlocked}
              title={busy && state !== 'filled' ? busyLabel : undefined}
              onClick={onPrimary}
              className={[
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold',
                state === 'filled'
                  ? 'bg-transparent border border-primary text-primary'
                  : 'bg-primary text-primary-foreground',
                primaryBlocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              <span>{loading ? (loadingLabel ?? t('tips.studio.loading')) : primaryLabel}</span>
            </button>
          )
        })()}
        {state === 'filled' && onRegen && !loading && !busy && (
          <button type="button" onClick={onRegen} className="text-xs font-bold text-primary cursor-pointer">
            ↻
            {' '}
            {t('tips.studio.regenerate')}
          </button>
        )}
      </div>
      {errorLabel && <p className="text-xs text-destructive">{errorLabel}</p>}
      {children}
    </div>
  )
}
