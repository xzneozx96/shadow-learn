import { Input } from '@/components/ui/input'

interface YouTubeTabProps {
  url: string
  onUrlChange: (url: string) => void
}

export function YouTubeTab({ url, onUrlChange }: YouTubeTabProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-white/65">YouTube URL</label>
      <Input
        placeholder="https://www.youtube.com/watch?v=..."
        value={url}
        onChange={e => onUrlChange(e.target.value)}
      />
    </div>
  )
}
