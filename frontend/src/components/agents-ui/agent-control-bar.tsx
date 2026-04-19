import type { MotionProps } from 'motion/react'
import type { ComponentProps } from 'react'
import type { UseInputControlsProps } from '@/hooks/agents-ui/use-agent-control-bar'
import { useChat } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Loader, MessageSquareTextIcon, SendHorizontal } from 'lucide-react'
import { motion } from 'motion/react'

import { useEffect, useRef, useState } from 'react'
import { AgentDisconnectButton } from '@/components/agents-ui/agent-disconnect-button'
import { AgentTrackControl } from '@/components/agents-ui/agent-track-control'
import { AgentTrackToggle } from '@/components/agents-ui/agent-track-toggle'
import { agentTrackToggleVariants } from '@/components/agents-ui/agent-track-toggle-variants'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import {
  useInputControls,

  usePublishPermissions,
} from '@/hooks/agents-ui/use-agent-control-bar'
import { cn } from '@/lib/utils'

const LK_TOGGLE_VARIANT_1 = [
  'data-[pressed]:bg-primary data-[pressed]:hover:bg-primary/90 data-[pressed]:border-primary',
  'data-[pressed]:text-primary-foreground data-[pressed]:hover:text-primary-foreground',
  'rounded-full',
]

const LK_TOGGLE_VARIANT_2 = [
  'data-[pressed]:bg-blue-500/20 data-[pressed]:hover:bg-blue-500/30',
  'data-[pressed]:border-blue-700/10 data-[pressed]:text-blue-700 data-[pressed]:ring-blue-700/30',
  'data-[pressed]:focus-visible:border-blue-700/50',
  'dark:data-[state=on]:bg-blue-500/20 dark:data-[state=on]:text-blue-300',
]

/** Configuration for which controls to display in the AgentControlBar. */
export interface AgentControlBarControls {
  /**
   * Whether to show the leave/disconnect button.
   *
   * @defaultValue true
   */
  leave?: boolean
  /**
   * Whether to show the camera toggle control.
   *
   * @defaultValue true (if camera publish permission is granted)
   */
  camera?: boolean
  /**
   * Whether to show the microphone toggle control.
   *
   * @defaultValue true (if microphone publish permission is granted)
   */
  microphone?: boolean
  /**
   * Whether to show the screen share toggle control.
   *
   * @defaultValue true (if screen share publish permission is granted)
   */
  screenShare?: boolean
  /**
   * Whether to show the chat toggle control.
   *
   * @defaultValue true (if data publish permission is granted)
   */
  chat?: boolean
}

export interface AgentControlBarProps extends UseInputControlsProps {
  /**
   * The visual style of the control bar.
   *
   * @default 'default'
   */
  variant?: 'default' | 'outline' | 'livekit'
  /**
   * This takes an object with the following keys: `leave`, `microphone`, `screenShare`, `camera`,
   * `chat`. Each key maps to a boolean value that determines whether the control is displayed.
   *
   * @default
   * {
   *   leave: true,
   *   microphone: true,
   *   screenShare: true,
   *   camera: true,
   *   chat: true,
   * }
   */
  controls?: AgentControlBarControls
  /**
   * Whether to save user choices.
   *
   * @default true
   */
  saveUserChoices?: boolean
  /**
   * Whether the agent is connected to a session.
   *
   * @default false
   */
  isConnected?: boolean
  /**
   * Whether the chat input interface is open.
   *
   * @default false
   */
  isChatOpen?: boolean
  /** The callback for when the user disconnects. */
  onDisconnect?: () => void
  /** The callback for when the chat is opened or closed. */
  onIsChatOpenChange?: (open: boolean) => void
  /** The callback for when a device error occurs. */
  onDeviceError?: (error: { source: Track.Source, error: Error }) => void
}

/**
 * A control bar specifically designed for voice assistant interfaces. Provides controls for
 * microphone, camera, screen share, chat, and disconnect. Includes an expandable chat input for
 * text-based interaction with the agent.
 *
 * @example
 *
 * ```tsx
 * <AgentControlBar
 *   variant="livekit"
 *   isConnected={true}
 *   onDisconnect={() => handleDisconnect()}
 *   controls={{
 *     microphone: true,
 *     camera: true,
 *     screenShare: false,
 *     chat: true,
 *     leave: true,
 *   }}
 * />;
 * ```
 *
 * @extends ComponentProps<'div'>
 */
export function AgentControlBar({
  variant = 'default',
  controls,
  isChatOpen = false,
  isConnected = false,
  saveUserChoices = true,
  onDisconnect,
  onDeviceError,
  onIsChatOpenChange,
  className,
  ...props
}: AgentControlBarProps & ComponentProps<'div'>) {
  const publishPermissions = usePublishPermissions()
  const [isChatOpenUncontrolled, setIsChatOpenUncontrolled] = useState(isChatOpen)
  const {
    microphoneTrack,
    cameraToggle,
    microphoneToggle,
    screenShareToggle,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
    handleMicrophoneDeviceSelectError,
    handleCameraDeviceSelectError,
  } = useInputControls({ onDeviceError, saveUserChoices })

  const visibleControls = {
    leave: controls?.leave ?? true,
    microphone: controls?.microphone ?? publishPermissions.microphone,
    screenShare: controls?.screenShare ?? publishPermissions.screenShare,
    camera: controls?.camera ?? publishPermissions.camera,
    chat: controls?.chat ?? publishPermissions.data,
  }

  const isEmpty = Object.values(visibleControls).every(value => !value)

  if (isEmpty) {
    console.warn('AgentControlBar: `visibleControls` contains only false values.')
    return null
  }

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        'bg-background border-input flex flex-col border p-3 rounded-full',
        className,
      )}
      {...props}
    >
      <div className="flex gap-1">
        <div className="flex grow gap-1">
          {/* Toggle Microphone */}
          {visibleControls.microphone && (
            <AgentTrackControl
              variant={variant}
              kind="audioinput"
              aria-label="Toggle microphone"
              source={Track.Source.Microphone}
              pressed={microphoneToggle.enabled}
              disabled={microphoneToggle.pending}
              audioTrack={microphoneTrack}
              onPressedChange={microphoneToggle.toggle}
              onActiveDeviceChange={handleAudioDeviceChange}
              onMediaDeviceError={handleMicrophoneDeviceSelectError}
            />
          )}

          {/* Toggle Camera */}
          {visibleControls.camera && (
            <AgentTrackControl
              variant={variant}
              kind="videoinput"
              aria-label="Toggle camera"
              source={Track.Source.Camera}
              pressed={cameraToggle.enabled}
              pending={cameraToggle.pending}
              disabled={cameraToggle.pending}
              onPressedChange={cameraToggle.toggle}
              onMediaDeviceError={handleCameraDeviceSelectError}
              onActiveDeviceChange={handleVideoDeviceChange}
              className={cn(
                variant === 'livekit' && [
                  LK_TOGGLE_VARIANT_1,
                  'rounded-full [&_button:first-child]:rounded-l-full [&_button:last-child]:rounded-r-full',
                ],
              )}
            />
          )}

          {/* Toggle Screen Share */}
          {visibleControls.screenShare && (
            <AgentTrackToggle
              variant={variant === 'outline' ? 'outline' : 'default'}
              aria-label="Toggle screen share"
              source={Track.Source.ScreenShare}
              pressed={screenShareToggle.enabled}
              disabled={screenShareToggle.pending}
              onPressedChange={screenShareToggle.toggle}
              className={cn(variant === 'livekit' && [LK_TOGGLE_VARIANT_2, 'rounded-full'])}
            />
          )}

          {/* Toggle Transcript */}
          {visibleControls.chat && (
            <Toggle
              variant={variant === 'outline' ? 'outline' : 'default'}
              pressed={isChatOpen || isChatOpenUncontrolled}
              aria-label="Toggle transcript"
              onPressedChange={(state) => {
                if (!onIsChatOpenChange)
                  setIsChatOpenUncontrolled(state)
                else onIsChatOpenChange(state)
              }}
              className={agentTrackToggleVariants({
                variant: variant === 'outline' ? 'outline' : 'default',
                className: cn(variant === 'livekit' && [LK_TOGGLE_VARIANT_2, 'rounded-full']),
              })}
            >
              <MessageSquareTextIcon />
            </Toggle>
          )}
        </div>

        {/* Disconnect */}
        {visibleControls.leave && (
          <AgentDisconnectButton
            size="lg"
            onClick={onDisconnect}
            disabled={!isConnected}
            className={cn(
              variant === 'livekit'
              && 'bg-destructive/10 dark:bg-destructive/10 text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/20 focus:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/4 rounded-full font-mono text-xs font-bold tracking-wider',
            )}
          >
            <span className="hidden md:inline">END CALL</span>
            <span className="inline md:hidden">END</span>
          </AgentDisconnectButton>
        )}
      </div>
    </div>
  )
}
