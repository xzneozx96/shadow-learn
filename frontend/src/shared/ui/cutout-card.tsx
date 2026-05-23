import type { ComponentProps, HTMLAttributes, ImgHTMLAttributes, MouseEventHandler } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { createContext, use, useCallback, useMemo, useState } from 'react'
import { cn } from '@/shared/lib/utils'

export const cutoutCardSurfaceShadowClassName = cn(
  'border border-border/80 dark:border-border/60',
  'shadow-[0px_1px_2px_-1px_color-mix(in_oklab,var(--foreground)_8%,transparent),0px_4px_8px_-2px_color-mix(in_oklab,var(--foreground)_6%,transparent),0px_8px_16px_-4px_color-mix(in_oklab,var(--foreground)_5%,transparent)]',
  'transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
  'hover:border-border hover:shadow-[0px_2px_4px_-1px_color-mix(in_oklab,var(--foreground)_10%,transparent),0px_8px_16px_-4px_color-mix(in_oklab,var(--foreground)_8%,transparent),0px_16px_32px_-8px_color-mix(in_oklab,var(--foreground)_6%,transparent)]',
)

export const cutoutCardSurfaceClassName = cn(
  'group/cutout relative cursor-pointer overflow-hidden rounded-xl bg-card text-card-foreground',
  cutoutCardSurfaceShadowClassName,
)

export function useCutoutContentStaggerVariants() {
  const reduceMotion = useReducedMotion()
  return useMemo(() => {
    if (reduceMotion) {
      return {
        container: { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0 } } },
        item: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } } },
      } as const
    }
    return {
      container: { hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } } },
      item: {
        hidden: { opacity: 0, y: 12, filter: 'blur(5px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', duration: 0.48, bounce: 0.14 } },
      },
    } as const
  }, [reduceMotion])
}

const CORNER_PATH = 'M0 200C155.996 199.961 200.029 156.308 200 0V200H0Z'

interface CutoutCardContextValue {
  hovered: boolean
  setHovered: (next: boolean) => void
}

const CutoutCardContext = createContext<CutoutCardContextValue | null>(null)

export function useCutoutCard() {
  const ctx = use(CutoutCardContext)
  if (!ctx)
    throw new Error('useCutoutCard must be used within <CutoutCard>')
  return ctx
}

export type CutoutCardProps = Omit<ComponentProps<typeof motion.div>, 'defaultValue'> & {
  defaultHovered?: boolean
  onHoveredChange?: (hovered: boolean) => void
  trackPointerHover?: boolean
}

export function CutoutCard({
  className,
  defaultHovered = false,
  onHoveredChange,
  trackPointerHover = true,
  onMouseEnter,
  onMouseLeave,
  children,
  ...props
}: CutoutCardProps) {
  const reduceMotion = useReducedMotion()
  const [hovered, setHoveredState] = useState(defaultHovered)

  const setHovered = useCallback((next: boolean) => {
    setHoveredState(next)
    onHoveredChange?.(next)
  }, [onHoveredChange])

  const ctx = useMemo<CutoutCardContextValue>(() => ({ hovered, setHovered }), [hovered, setHovered])

  const handleMouseEnter: MouseEventHandler<HTMLDivElement> = (e) => {
    onMouseEnter?.(e)
    if (e.defaultPrevented || !trackPointerHover)
      return
    setHovered(true)
  }
  const handleMouseLeave: MouseEventHandler<HTMLDivElement> = (e) => {
    onMouseLeave?.(e)
    if (e.defaultPrevented || !trackPointerHover)
      return
    setHovered(false)
  }

  return (
    <CutoutCardContext value={ctx}>
      <motion.div
        animate={{ opacity: 1 }}
        className={cn(className)}
        data-slot="cutout-card"
        data-state={hovered ? 'hovered' : 'idle'}
        initial={{ opacity: 0 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        transition={reduceMotion
          ? { duration: 0.22, ease: [0.23, 1, 0.32, 1] }
          : { duration: 0.36, ease: [0.23, 1, 0.32, 1] }}
        {...props}
      >
        {children}
      </motion.div>
    </CutoutCardContext>
  )
}

export type CutoutCardMediaProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardMedia({ className, ...props }: CutoutCardMediaProps) {
  return <div className={cn('relative overflow-hidden', className)} data-slot="cutout-card-media" {...props} />
}

export type CutoutCardImageProps = ImgHTMLAttributes<HTMLImageElement>
export function CutoutCardImage({ className, alt = '', ...props }: CutoutCardImageProps) {
  return (
    <img
      alt={alt}
      className={cn(
        'h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/cutout:scale-105 rounded-tr-3xl',
        className,
      )}
      data-slot="cutout-card-image"
      {...props}
    />
  )
}

export type CutoutCardOverlayProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardOverlay({ className, ...props }: CutoutCardOverlayProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 bg-linear-to-t from-background/35 via-transparent to-transparent dark:from-background/50',
        className,
      )}
      data-slot="cutout-card-overlay"
      {...props}
    />
  )
}

export type CutoutCardContentProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardContent({ className, ...props }: CutoutCardContentProps) {
  return <div className={cn('p-6', className)} data-slot="cutout-card-content" {...props} />
}

export type CutoutCardFooterProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardFooter({ className, ...props }: CutoutCardFooterProps) {
  return <div className={cn('flex items-center gap-4', className)} data-slot="cutout-card-footer" {...props} />
}

export type CutoutCornerProps = ComponentProps<'svg'> & { size?: number }
export function CutoutCorner({ className, size = 32, viewBox = '0 0 200 200', ...props }: CutoutCornerProps) {
  return (
    <svg
      aria-hidden
      className={cn(className)}
      data-slot="cutout-corner"
      height={size}
      viewBox={viewBox}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d={CORNER_PATH} fill="currentColor" />
    </svg>
  )
}

export type CutoutCardInsetLabelProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardInsetLabel({ className, ...props }: CutoutCardInsetLabelProps) {
  return <div className={cn('absolute', className)} data-slot="cutout-card-inset-label" {...props} />
}

export type CutoutCardPinProps = HTMLAttributes<HTMLDivElement>
export function CutoutCardPin({ className, ...props }: CutoutCardPinProps) {
  return <div className={cn('absolute', className)} data-slot="cutout-card-pin" {...props} />
}

export type CutoutCardActionProps = ComponentProps<typeof motion.div> & {
  revealOnHover?: boolean
}
export function CutoutCardAction({ className, revealOnHover = true, ...props }: CutoutCardActionProps) {
  const { hovered } = useCutoutCard()
  const reduceMotion = useReducedMotion()
  const visible = !revealOnHover || hovered
  return (
    <motion.div
      animate={visible
        ? { opacity: 1, transform: 'translateY(0px)' }
        : { opacity: 0, transform: 'translateY(8px)' }}
      className={cn('absolute', revealOnHover && !visible && 'pointer-events-none', className)}
      data-reveal={revealOnHover ? 'hover' : 'always'}
      data-slot="cutout-card-action"
      transition={reduceMotion
        ? { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
        : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      {...props}
    />
  )
}
