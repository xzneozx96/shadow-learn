/* eslint-disable react-refresh/only-export-components */
import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react'
import { cloneElement, createContext, isValidElement, memo, use, useCallback, useState } from 'react'

type BlurTint = 'light' | 'dark' | 'default'

interface FlipCardContextValue {
  isFlipped: boolean
  flipping: boolean
  flip: () => void
  borderRadius: number | string | undefined
  blurIntensity: number
  animationDuration: number
  tint: BlurTint
  scaleEnabled: boolean
  pressed: boolean
  setPressed: (v: boolean) => void
}

const FlipCardContext = createContext<FlipCardContextValue | null>(null)

function useFlipCard(): FlipCardContextValue {
  const ctx = use(FlipCardContext)
  if (!ctx)
    throw new Error('FlipCard compound components must be used within FlipCard')
  return ctx
}

interface FlipCardProps {
  children?: ReactNode
  /** Controlled flip state. If omitted, component is uncontrolled. */
  flipped?: boolean
  defaultFlipped?: boolean
  onFlippedChange?: (flipped: boolean) => void
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  /** Set to 0 to disable the frosted-glass overlay. */
  blurIntensity?: number
  blurTint?: BlurTint
  animationDuration?: number
  /** CSS easing string. */
  easing?: string
  enableHaptics?: boolean
  scaleOnPress?: boolean
  className?: string
  style?: CSSProperties
  containerStyle?: CSSProperties
}

interface FlipCardFaceProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

interface FlipCardTriggerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  asChild?: boolean
  children?: ReactNode
}

function FlipCardRoot({
  children,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlippedChange,
  width,
  height,
  borderRadius,
  blurIntensity = 0,
  containerStyle,
  className,
  style,
  animationDuration = 600,
  easing = 'cubic-bezier(0.65, 0, 0.35, 1)',
  enableHaptics = false,
  blurTint = 'light',
  scaleOnPress = true,
}: FlipCardProps) {
  const isControlled = flippedProp !== undefined
  const [internalFlipped, setInternalFlipped] = useState(defaultFlipped)
  const isFlipped = isControlled ? flippedProp : internalFlipped
  const [flipping, setFlipping] = useState(false)
  const [pressed, setPressed] = useState(false)

  const flip = useCallback(() => {
    const next = !isFlipped
    if (enableHaptics && typeof navigator !== 'undefined' && 'vibrate' in navigator)
      navigator.vibrate?.(10)

    if (!isControlled)
      setInternalFlipped(next)
    onFlippedChange?.(next)

    setFlipping(true)
    window.setTimeout(setFlipping, animationDuration, false)
  }, [isFlipped, isControlled, onFlippedChange, enableHaptics, animationDuration])

  return (
    <FlipCardContext
      value={{
        isFlipped,
        flipping,
        flip,
        borderRadius,
        blurIntensity,
        animationDuration,
        tint: blurTint,
        scaleEnabled: scaleOnPress,
        pressed,
        setPressed,
      }}
    >
      <div
        className={className}
        style={{
          width,
          height,
          position: 'relative',
          perspective: 1200,
          ...containerStyle,
          ...style,
        }}
      >
        <div
          style={{
            display: 'grid',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: `transform ${animationDuration}ms ${easing}`,
            transform: `rotateY(${isFlipped ? 180 : 0}deg) scale(${pressed ? 0.97 : 1})`,
          }}
        >
          {children}
        </div>
      </div>
    </FlipCardContext>
  )
}

function Face({ children, style, className, back }: FlipCardFaceProps & { back: boolean }) {
  const { flipping, borderRadius, blurIntensity, animationDuration, tint } = useFlipCard()

  const tintBg
    = tint === 'dark'
      ? 'rgba(0,0,0,0.25)'
      : tint === 'light'
        ? 'rgba(255,255,255,0.18)'
        : 'rgba(127,127,127,0.15)'

  const blurPx = flipping ? blurIntensity / 10 : 0

  return (
    <div
      className={className}
      style={{
        gridArea: '1 / 1',
        position: 'relative',
        borderRadius,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        ...style,
      }}
    >
      {children}
      {blurIntensity > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius,
            pointerEvents: 'none',
            backgroundColor: flipping ? tintBg : 'transparent',
            backdropFilter: `blur(${blurPx}px)`,
            WebkitBackdropFilter: `blur(${blurPx}px)`,
            transition: `backdrop-filter ${animationDuration / 2}ms ease-in-out, -webkit-backdrop-filter ${animationDuration / 2}ms ease-in-out, background-color ${animationDuration / 2}ms ease-in-out`,
          }}
        />
      )}
    </div>
  )
}

const Front = memo((props: FlipCardFaceProps) => {
  return <Face {...props} back={false} />
})

const Back = memo((props: FlipCardFaceProps) => {
  return <Face {...props} back />
})

const Trigger = memo(({ children, asChild, style, ...rest }: FlipCardTriggerProps) => {
  const { flip, scaleEnabled, setPressed } = useFlipCard()

  const onPointerDown = () => {
    if (scaleEnabled)
      setPressed(true)
  }
  const onPointerEnd = () => {
    if (scaleEnabled)
      setPressed(false)
  }

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<HTMLAttributes<HTMLElement>>
    return cloneElement(child, {
      onClick: flip,
      onPointerDown,
      onPointerUp: onPointerEnd,
      onPointerLeave: onPointerEnd,
      ...rest,
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={flip}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          flip()
        }
      }}
      style={{
        gridArea: '1 / 1',
        position: 'relative',
        zIndex: 1,
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

export const FlipCard = Object.assign(FlipCardRoot, {
  Front,
  Back,
  Trigger,
})

export type {
  FlipCardFaceProps,
  FlipCardProps,
  FlipCardTriggerProps,
}
