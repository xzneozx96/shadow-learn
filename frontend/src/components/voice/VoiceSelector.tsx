import type { VoiceOption } from '@/lib/voices'
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'

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
    const audio = new Audio(voice.sampleAudio)
    audioRef.current = audio
    setPlayingId(voice.id)
    audio.play().catch(() => {})
    audio.addEventListener('ended', () => setPlayingId(null), { once: true })
  }

  return (
    <div className="flex flex-col gap-3 bg-input/50">
      {voices.map((voice) => {
        const isSelected = voice.id === selectedId
        const isPlaying = playingId === voice.id
        return (
          <div
            key={voice.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(voice.id)}
            className={cn(
              'rounded-lg border flex items-center gap-3 p-2 cursor-pointer select-none transition-colors duration-100',
              isSelected ? 'bg-primary/15' : 'hover:bg-secondary',
            )}
          >
            <img
              src={voice.avatarUrl}
              alt=""
              className="size-[38px] rounded-md object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{voice.label}</div>
              <div className="text-xs text-muted-foreground">{voice.description}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSelected && (
                <div className="size-4 rounded-full bg-indigo-500 flex items-center justify-center">
                  <div className="size-2 rounded-full bg-white" />
                </div>
              )}
              <Button
                variant="secondary"
                size="icon-lg"
                aria-label={isPlaying ? 'stop preview' : 'play preview'}
                onClick={e => handlePlay(e, voice)}
              >
                {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
