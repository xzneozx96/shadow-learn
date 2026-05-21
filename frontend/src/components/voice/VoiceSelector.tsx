import type { VoiceOption } from '@/lib/voices'
import { Check, ChevronsUpDown, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

interface VoiceSelectorProps {
  voices: VoiceOption[]
  selectedId: string
  onSelect: (id: string) => void
}

export function VoiceSelector({ voices, selectedId, onSelect }: VoiceSelectorProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

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

  function handleSelect(id: string) {
    onSelect(id)
    setOpen(false)
  }

  const selected = voices.find(v => v.id === selectedId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border bg-input/50 px-3 py-2 cursor-pointer select-none',
          'hover:bg-secondary transition-colors duration-100',
        )}
      >
        {selected && (
          <img
            src={selected.avatarUrl}
            alt=""
            className="size-8 rounded-md object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-foreground truncate">{selected?.label ?? '—'}</div>
          <div className="text-xs text-muted-foreground truncate">{selected?.description ?? ''}</div>
        </div>
        <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
      </PopoverTrigger>

      <PopoverContent
        className="w-(--anchor-width) p-1.5 min-w-[280px]"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        <div className="flex flex-col gap-0.5">
          {voices.map((voice) => {
            const isSelected = voice.id === selectedId
            const isPlaying = playingId === voice.id
            return (
              <div
                key={voice.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(voice.id)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer select-none transition-colors duration-100',
                  isSelected ? 'bg-primary/10' : 'hover:bg-input',
                )}
              >
                <img
                  src={voice.avatarUrl}
                  alt=""
                  className="size-8 rounded-md object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{voice.label}</div>
                  <div className="text-xs text-muted-foreground">{voice.description}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isSelected && (
                    <Check className="size-5 text-primary" />
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={isPlaying ? 'stop preview' : 'play preview'}
                    onClick={e => handlePlay(e, voice)}
                  >
                    {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
