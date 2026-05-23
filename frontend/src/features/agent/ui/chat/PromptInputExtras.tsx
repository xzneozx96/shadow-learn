import { AudioLines, ImageIcon, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  PromptInputButton,
  usePromptInputAttachments,
} from '@/shared/ui/ai-elements/prompt-input'

// Max recording burst — must match MAX_BURST_MS in useVoiceInput.
const BURST_DURATION_S = 30
const WAVE_BAR_COUNT = 4

function generateBarHeights(): number[][] {
  return Array.from({ length: WAVE_BAR_COUNT }).fill([
    6 + Math.random() * 3,
    14 + Math.random() * 4,
    5 + Math.random() * 3,
  ])
}

/** Circular recording button — destructive-colored countdown border + bouncing waveform. Click to stop. */
export function RecordingPill({ onStop, label }: { onStop: () => void, label: string }) {
  const [barHeights] = useState(generateBarHeights)
  return (
    <motion.button
      type="button"
      onClick={onStop}
      aria-label={label}
      initial={{ scale: 0.7, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-destructive/15 text-destructive focus-visible:outline-none"
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <motion.circle
          cx="50%"
          cy="50%"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          pathLength={1}
          strokeDasharray="1"
          strokeLinecap="round"
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: BURST_DURATION_S, ease: 'linear' }}
        />
      </svg>
      <div className="relative z-10 flex items-center gap-[2px]">
        {barHeights.map((heights, i) => (
          <motion.div
            key={i}
            animate={{ height: heights }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear', delay: i * 0.08 }}
            style={{ originY: 1 }}
            className="w-[2.5px] rounded-full bg-destructive"
          />
        ))}
      </div>
    </motion.button>
  )
}

/** Speak-with-AI button — gradient pill that opens the voice session modal. */
export function SpeakWithAIButton({ onClick, title, muted }: { onClick: () => void, title: string, muted?: boolean }) {
  return (
    <PromptInputButton
      variant="default"
      size="icon-sm"
      onClick={muted ? undefined : onClick}
      title={title}
      aria-label={title}
      className={`bg-linear-to-br from-[#7e14ff] via-[#5b6cff] to-[#47bfff] text-white shadow-sm shadow-[#5b6cff]/40 hover:from-[#9341ff] hover:via-[#7787ff] hover:to-[#5fc8ff] hover:text-white${muted ? ' pointer-events-none opacity-50' : ''}`}
    >
      <AudioLines className="size-4" />
    </PromptInputButton>
  )
}

/** Attach-image button — must be rendered inside a <PromptInput> so the context is available. */
export function AttachImageButton({ tooltip, muted }: { tooltip: string, muted?: boolean }) {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton
      size="icon-sm"
      title={tooltip}
      aria-label={tooltip}
      onClick={muted ? undefined : attachments.openFileDialog}
      className={muted ? 'pointer-events-none opacity-50' : undefined}
    >
      <ImageIcon className="size-4" />
    </PromptInputButton>
  )
}

/** Thumbnail strip for attached images — must be inside a <PromptInput>. */
export function AttachmentPreviewBar({ altFallback, removeLabel }: { altFallback: string, removeLabel: string }) {
  const { files, remove } = usePromptInputAttachments()
  if (files.length === 0)
    return null
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-1">
      {files.map(f => (
        <div key={f.id} className="relative size-14 shrink-0">
          <img
            src={f.url}
            alt={f.filename ?? altFallback}
            className="size-full rounded-md object-cover border border-border"
          />
          <button
            type="button"
            aria-label={removeLabel}
            onClick={() => remove(f.id)}
            className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
