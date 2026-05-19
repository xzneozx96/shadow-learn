import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TranslationKey } from '@/lib/i18n'
import { Check, Loader2, Lock, RotateCw, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/I18nContext'

export type StudioTileAccent = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose'

interface Props {
  Icon: LucideIcon
  titleKey: TranslationKey
  blurbKey: TranslationKey
  state: 'empty' | 'filled' | 'locked' | 'disabled'
  accent?: StudioTileAccent
  badge?: string
  primaryLabel?: string
  onPrimary?: () => void
  onRegen?: () => void
  errorLabel?: string
  loading?: boolean
  loadingLabel?: string
  /**
   * When false, the right-side affordance (wand / rotate) is suppressed
   * to avoid the brief mis-icon flash before the hook resolves IDB
   * hydration. Defaults to true so existing call sites keep working.
   */
  hydrated?: boolean
  children?: ReactNode
}

// Per-accent color tokens. Two saturations: muted (empty / resting) and
// vivid (filled). Tablet users see filled tiles at a glance because the
// icon chip is fully colored, not because they hovered.
const ACCENT: Record<StudioTileAccent, {
  emptyChipBg: string
  emptyChipFg: string
  filledChipBg: string
  filledChipFg: string
  filledDot: string
}> = {
  blue: {
    emptyChipBg: 'bg-blue-500/10',
    emptyChipFg: 'text-blue-400/70',
    filledChipBg: 'bg-blue-500/25',
    filledChipFg: 'text-blue-300',
    filledDot: 'bg-blue-400',
  },
  emerald: {
    emptyChipBg: 'bg-emerald-500/10',
    emptyChipFg: 'text-emerald-400/70',
    filledChipBg: 'bg-emerald-500/25',
    filledChipFg: 'text-emerald-300',
    filledDot: 'bg-emerald-400',
  },
  amber: {
    emptyChipBg: 'bg-amber-500/10',
    emptyChipFg: 'text-amber-400/70',
    filledChipBg: 'bg-amber-500/25',
    filledChipFg: 'text-amber-300',
    filledDot: 'bg-amber-400',
  },
  violet: {
    emptyChipBg: 'bg-violet-500/10',
    emptyChipFg: 'text-violet-400/70',
    filledChipBg: 'bg-violet-500/25',
    filledChipFg: 'text-violet-300',
    filledDot: 'bg-violet-400',
  },
  rose: {
    emptyChipBg: 'bg-rose-500/10',
    emptyChipFg: 'text-rose-400/70',
    filledChipBg: 'bg-rose-500/25',
    filledChipFg: 'text-rose-300',
    filledDot: 'bg-rose-400',
  },
}

/**
 * Tablet-first studio tile.
 *
 * Two visual axes carry meaning at a glance, without depending on hover:
 *   - Icon chip saturation: empty = ghosted, filled = vivid. The first
 *     thing the eye lands on already tells you which artifacts exist.
 *   - Right rail: empty shows a chevron; filled adds a "Ready" dot + a
 *     persistent regen button. Loading swaps the chevron for a spinner;
 *     error swaps it for a "Try again" affordance and tints the title.
 *
 * Interaction:
 *   - The tile is one large press target (>= 64px tall) for the primary
 *     action (open / generate).
 *   - Regen is its own button — persistently visible when filled, sized
 *     to a 36px touch target, with stopPropagation so it doesn't bubble
 *     into the tile's primary press.
 *   - Press feedback uses `active:` (works on touch), not `hover:`. A
 *     short transition on background-color is the only motion at rest.
 */
export function StudioTile({
  Icon,
  titleKey,
  blurbKey,
  state,
  accent = 'blue',
  badge,
  primaryLabel,
  onPrimary,
  onRegen,
  errorLabel,
  loading,
  loadingLabel,
  hydrated = true,
  children,
}: Props) {
  const { t } = useI18n()
  const title = t(titleKey)
  const blurb = t(blurbKey)
  const isLocked = state === 'locked'
  const isDisabled = state === 'disabled'
  const isFilled = state === 'filled'
  const isInert = isLocked || isDisabled || !onPrimary
  const isError = !!errorLabel

  const a = ACCENT[accent]
  // Before hydration we don't yet know if the tile is empty or filled —
  // render the muted chip so the eventual filled→saturated transition
  // (or empty→stays-muted) doesn't read as a flash. Same for the right
  // rail affordance: suppress wand/rotate until we know which one is
  // correct, otherwise the user sees "wand → rotate" pop on cached tiles.
  const chipBg = !hydrated || !isFilled ? a.emptyChipBg : a.filledChipBg
  const chipFg = !hydrated || !isFilled ? a.emptyChipFg : a.filledChipFg
  const showRegen = hydrated && isFilled && !!onRegen && !loading && !isError
  const showIndicator = hydrated && (!isFilled || loading || isError)

  return (
    <div
      data-tile
      data-state={state}
      data-locked={isLocked ? 'true' : 'false'}
      className={[
        'relative flex items-stretch rounded-xl border border-border bg-card hover:border-primary/60',
        'transition-colors duration-150',
        isLocked ? 'opacity-50' : '',
        isDisabled ? 'opacity-60' : '',
        isError ? 'border-rose-500/40' : '',
      ].join(' ')}
    >
      {/* Primary press target. Whole tile fires onPrimary. */}
      <button
        type="button"
        onClick={isInert ? undefined : onPrimary}
        disabled={isInert || loading}
        aria-label={`${title} — ${primaryLabel ?? ''}`.trim()}
        className={[
          'flex flex-1 min-w-0 items-center gap-3 rounded-xl px-3.5 py-3 text-left min-h-[68px]',
          isInert ? 'cursor-not-allowed' : 'cursor-pointer active:bg-muted/40',
          loading ? 'cursor-progress' : '',
        ].join(' ')}
      >
        {/* Icon chip */}
        <div
          className={[
            'relative shrink-0 size-10 rounded-lg flex items-center justify-center',
            chipBg,
            chipFg,
            loading ? 'animate-pulse' : '',
          ].join(' ')}
        >
          <Icon className="size-5" strokeWidth={2} />
          {isLocked && (
            <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-card flex items-center justify-center">
              <Lock className="size-2.5 text-muted-foreground" />
            </span>
          )}
          {/* Ready badge: anchored to the top-right of the icon chip
              (notification-badge convention). A solid dot + a slower,
              softer halo than `animate-ping` — multiple filled tiles in
              the same column shouldn't read as alert spam. */}
          {hydrated && isFilled && !loading && !isError && (
            <span aria-hidden className="absolute -top-1 -right-1 flex items-center justify-center">
              <span
                className={[
                  'absolute inline-flex size-3 rounded-full',
                  a.filledDot,
                  'animate-[studio-ready-pulse_2.4s_ease-in-out_infinite]',
                ].join(' ')}
              />
              <span className={['relative inline-flex size-2 rounded-full ring-2 ring-card', a.filledDot].join(' ')} />
            </span>
          )}
        </div>

        {/* Label stack */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className={[
              'text-[14px] font-semibold leading-tight truncate',
              isError ? 'text-rose-300' : 'text-foreground',
            ].join(' ')}
            >
              {title}
            </h3>
            {badge && (
              <span className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full font-bold shrink-0">
                {badge}
              </span>
            )}
          </div>
          <p className={[
            'text-[12px] leading-snug mt-0.5 truncate',
            loading ? 'text-foreground/75' : 'text-muted-foreground',
          ].join(' ')}
          >
            {loading ? (loadingLabel ?? t('tips.studio.loading')) : isError ? errorLabel : blurb}
          </p>
        </div>
      </button>

      {/* Right rail: regen (persistent on filled) + chevron / spinner. Sits
          outside the primary <button> so taps don't bubble. */}
      <div className="flex items-center pr-2.5 gap-0.5 shrink-0">
        {showRegen && (
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={(e) => { e.stopPropagation(); onRegen!() }}
            title={t('tips.studio.regenerate')}
            aria-label={t('tips.studio.regenerate')}
          >
            <RotateCw className="size-4" />
          </Button>
        )}
        {/* Primary indicator: shown only when the tile isn't already filled.
            Filled tiles surface the regen action instead — two affordances
            on one row reads as ambiguous. Loading + error states keep the
            indicator slot so the row width doesn't jump. Hidden entirely
            during the pre-hydration window to avoid the wand→rotate flash
            on cached tiles. */}
        {showIndicator && (
          <Button
            size="icon-lg"
            variant={loading ? 'ghost' : 'default'}
            onClick={isInert || loading ? undefined : (e) => { e.stopPropagation(); onPrimary?.() }}
            disabled={isInert || loading}
            aria-label={primaryLabel ?? title}
          >
            {loading
              ? <Loader2 className={['size-4 animate-spin', a.filledChipFg].join(' ')} />
              : isError
                ? <Check className="size-4 opacity-0" />
                : <WandSparkles className="size-4" />}
          </Button>
        )}
      </div>

      {children}
    </div>
  )
}
