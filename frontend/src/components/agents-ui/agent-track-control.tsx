import type { TrackReferenceOrPlaceholder } from '@livekit/components-react'
import type { VariantProps } from 'class-variance-authority'
import type { toggleVariants } from '@/components/ui/toggle'
import { AgentAudioVisualizerBar } from '@/components/agents-ui/agent-audio-visualizer-bar'
import { AgentTrackToggle } from '@/components/agents-ui/agent-track-toggle'
import { cn } from '@/lib/utils'

/**
 * Props for the AgentTrackControl component.
 */
export type AgentTrackControlProps = Omit<VariantProps<typeof toggleVariants>, 'variant'> & {
  /**
   * The variant of the control.
   */
  variant?: 'default' | 'outline' | 'livekit' | undefined

  /**
   * The type of media device (audioinput or videoinput).
   */
  kind: MediaDeviceKind
  /**
   * The track source to control (Microphone, Camera, or ScreenShare).
   */
  source: 'camera' | 'microphone' | 'screen_share'
  /**
   * Whether the track is currently enabled/published.
   */
  pressed?: boolean
  /**
   * Whether the control is in a pending/loading state.
   */
  pending?: boolean
  /**
   * Whether the control is disabled.
   */
  disabled?: boolean
  /**
   * Additional CSS class names to apply to the container.
   */
  className?: string
  /**
   * The audio track reference for visualization (only for microphone).
   */
  audioTrack?: TrackReferenceOrPlaceholder
  /**
   * Callback when the pressed state changes.
   */
  onPressedChange?: (pressed: boolean) => void
  /**
   * Callback when a media device error occurs.
   */
  onMediaDeviceError?: (error: Error) => void
  /**
   * Callback when the active device changes.
   */
  onActiveDeviceChange?: (deviceId: string) => void
}

/**
 * A combined track toggle and device selector control.
 * Includes a toggle button and a dropdown to select the active device.
 * For microphone tracks, displays an audio visualizer.
 *
 * @example
 * ```tsx
 * <AgentTrackControl
 *   kind="audioinput"
 *   source={Track.Source.Microphone}
 *   pressed={isMicEnabled}
 *   audioTrack={micTrackRef}
 *   onPressedChange={(pressed) => setMicEnabled(pressed)}
 *   onActiveDeviceChange={(deviceId) => setMicDevice(deviceId)}
 * />
 * ```
 */
const LIVEKIT_VARIANT = [
  'data-[pressed]:bg-primary data-[pressed]:hover:bg-primary/90 data-[pressed]:border-primary',
  'data-[pressed]:text-primary-foreground data-[pressed]:hover:text-primary-foreground',
  'rounded-full',
]

export function AgentTrackControl({
  variant = 'outline',
  source,
  pressed,
  pending,
  disabled,
  className,
  audioTrack,
  onPressedChange,
}: AgentTrackControlProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-0 rounded-full',
        className,
      )}
    >
      <AgentTrackToggle
        size="default"
        variant={variant === 'livekit' ? 'default' : variant}
        source={source}
        pressed={pressed}
        pending={pending}
        disabled={disabled}
        onPressedChange={onPressedChange}
        className={cn(
          'peer/track group/track focus:z-10 has-[.audiovisualizer]:w-auto has-[.audiovisualizer]:px-3 has-[~_button]:rounded-r-none has-[~_button]:border-r-0 has-[~_button]:pr-2 has-[~_button]:pl-3',
          variant === 'livekit' && LIVEKIT_VARIANT,
        )}
      >
        {audioTrack && (
          <AgentAudioVisualizerBar
            size="icon"
            barCount={3}
            state={pressed ? 'speaking' : 'disconnected'}
            audioTrack={pressed ? audioTrack : undefined}
            className="audiovisualizer flex h-5 w-auto items-center justify-center gap-0.5"
          >
            <span
              className="h-full min-h-0.5 w-0.5 origin-center bg-white"
            />
          </AgentAudioVisualizerBar>
        )}
      </AgentTrackToggle>
    </div>
  )
}
