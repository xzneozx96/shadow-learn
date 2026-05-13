import type { VoiceOption } from '@/lib/voices'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface VoiceSelectorProps {
  voices: VoiceOption[]
  selectedId: string
  onSelect: (id: string) => void
}

export function VoiceSelector({ voices, selectedId, onSelect }: VoiceSelectorProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  function handlePlay(e: React.MouseEvent, voice: VoiceOption) {
    e.stopPropagation()
    if (playingId === voice.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(voice.previewUrl)
    audioRef.current = audio
    setPlayingId(voice.id)
    audio.play().catch(() => {})
    audio.addEventListener('ended', () => setPlayingId(null), { once: true })
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {voices.map((voice, i) => {
        const isSelected = voice.id === selectedId
        const isPlaying = playingId === voice.id
        return (
          <div
            key={voice.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(voice.id)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors duration-100',
              i < voices.length - 1 && 'border-b border-border',
              isSelected ? 'bg-indigo-500/15' : 'hover:bg-white/5',
            )}
          >
            <img
              src={voice.avatarUrl}
              alt=""
              className="size-[38px] rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{voice.label}</div>
              <div className="text-xs text-muted-foreground">{voice.description}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSelected && (
                <div className="size-3.5 rounded-full bg-indigo-500 flex items-center justify-center">
                  <div className="size-[5px] rounded-full bg-white" />
                </div>
              )}
              <button
                type="button"
                aria-label={isPlaying ? 'stop preview' : 'play preview'}
                onClick={e => handlePlay(e, voice)}
                className={cn(
                  'size-[26px] rounded-full border flex items-center justify-center text-[10px] transition-colors',
                  isPlaying
                    ? 'bg-indigo-500/30 border-indigo-400 text-indigo-300'
                    : 'bg-white/6 border-white/15 text-muted-foreground hover:border-white/30',
                )}
              >
                {isPlaying ? '■' : '▶'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
