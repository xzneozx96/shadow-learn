import type { AgentState, TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react'
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client'
import type { AnimationPlaybackControlsWithThen, ValueAnimationTransition } from 'motion/react'
import {

  useTrackVolume,
} from '@livekit/components-react'
import {
  animate,

  useMotionValue,
  useMotionValueEvent,

} from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_SPEED = 10
const DEFAULT_AMPLITUDE = 2
const DEFAULT_FREQUENCY = 0.5
const DEFAULT_SCALE = 0.2
const DEFAULT_BRIGHTNESS = 1.5

function speedForState(state: AgentState | undefined): number {
  switch (state) {
    case 'listening':
    case 'pre-connect-buffering':
      return 20
    case 'thinking':
    case 'connecting':
    case 'initializing':
      return 30
    case 'speaking':
      return 70
    default:
      return DEFAULT_SPEED
  }
}
const DEFAULT_TRANSITION: ValueAnimationTransition = { duration: 0.5, ease: 'easeOut' }
const DEFAULT_PULSE_TRANSITION: ValueAnimationTransition = {
  duration: 0.35,
  ease: 'easeOut',
  repeat: Infinity,
  repeatType: 'mirror',
}

function useAnimatedValue<T>(initialValue: T) {
  const [value, setValue] = useState(initialValue)
  const motionValue = useMotionValue(initialValue)
  const controlsRef = useRef<AnimationPlaybackControlsWithThen | null>(null)
  useMotionValueEvent(motionValue, 'change', value => setValue(value as T))

  const animateFn = useCallback(
    (targetValue: T | T[], transition: ValueAnimationTransition) => {
      controlsRef.current = animate(motionValue, targetValue, transition)
    },
    [motionValue],
  )

  return { value, motionValue, controls: controlsRef, animate: animateFn }
}

export function useAgentAudioVisualizerAura(
  state: AgentState | undefined,
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder,
) {
  // Derived from state — no state, no effect (React guide: "transforming data for rendering")
  const speed = speedForState(state)
  const {
    value: scale,
    animate: animateScale,
    motionValue: scaleMotionValue,
  } = useAnimatedValue(DEFAULT_SCALE)
  const { value: amplitude, animate: animateAmplitude } = useAnimatedValue(DEFAULT_AMPLITUDE)
  const { value: frequency, animate: animateFrequency } = useAnimatedValue(DEFAULT_FREQUENCY)
  const { value: brightness, animate: animateBrightness } = useAnimatedValue(DEFAULT_BRIGHTNESS)

  const volume = useTrackVolume(audioTrack as TrackReference, {
    fftSize: 512,
    smoothingTimeConstant: 0.55,
  })

  // Motion animations are real side effects (not state updates) — keep in useEffect.
  useEffect(() => {
    switch (state) {
      case 'idle':
      case 'failed':
      case 'disconnected':
        animateScale(0.2, DEFAULT_TRANSITION)
        animateAmplitude(1.2, DEFAULT_TRANSITION)
        animateFrequency(0.4, DEFAULT_TRANSITION)
        animateBrightness(1.0, DEFAULT_TRANSITION)
        return
      case 'listening':
      case 'pre-connect-buffering':
        animateScale(0.3, { type: 'spring', duration: 1.0, bounce: 0.35 })
        animateAmplitude(1.0, DEFAULT_TRANSITION)
        animateFrequency(0.7, DEFAULT_TRANSITION)
        animateBrightness([1.5, 2.0], DEFAULT_PULSE_TRANSITION)
        return
      case 'thinking':
      case 'connecting':
      case 'initializing':
        animateScale(0.3, DEFAULT_TRANSITION)
        animateAmplitude(0.5, DEFAULT_TRANSITION)
        animateFrequency(1, DEFAULT_TRANSITION)
        animateBrightness([0.5, 2.5], DEFAULT_PULSE_TRANSITION)
        return
      case 'speaking':
        animateScale(0.3, DEFAULT_TRANSITION)
        animateAmplitude(0.75, DEFAULT_TRANSITION)
        animateFrequency(1.25, DEFAULT_TRANSITION)
        animateBrightness(1.5, DEFAULT_TRANSITION)
    }
  }, [state, animateScale, animateAmplitude, animateFrequency, animateBrightness])

  useEffect(() => {
    if (state === 'speaking' && volume > 0 && !scaleMotionValue.isAnimating()) {
      animateScale(0.2 + 0.2 * volume, { duration: 0 })
    }
  }, [state, volume, scaleMotionValue, animateScale])

  return {
    speed,
    scale,
    amplitude,
    frequency,
    brightness,
  }
}
