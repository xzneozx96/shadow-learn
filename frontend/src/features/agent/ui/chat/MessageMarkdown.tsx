import type { ComponentProps } from 'react'
import { memo, useMemo } from 'react'
import { Streamdown } from 'streamdown'

type StreamdownProps = ComponentProps<typeof Streamdown>

const TIMESTAMP_TOKEN_RE = /\[(\d{1,2}(?::\d{2}){1,2})\](?!\()/g
// Hash URLs survive rehype-sanitize + rehype-harden untouched. Encode seconds as
// `#t=<seconds>` so the link round-trips through Streamdown's default pipeline.
const TIMESTAMP_HASH_PREFIX = '#t='

function tokenToSeconds(token: string): number {
  const parts = token.split(':').map(p => Number.parseInt(p, 10))
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

function linkifyTimestamps(text: string): string {
  return text.replace(TIMESTAMP_TOKEN_RE, (_, token) => `[${token}](${TIMESTAMP_HASH_PREFIX}${tokenToSeconds(token)})`)
}

function makeTimestampComponents(onSeek: (seconds: number) => void): NonNullable<StreamdownProps['components']> {
  return {
    a: ({ href, children }) => {
      const decoded = typeof href === 'string' ? decodeURIComponent(href) : ''
      if (decoded.startsWith(TIMESTAMP_HASH_PREFIX)) {
        const sec = Number.parseInt(decoded.slice(TIMESTAMP_HASH_PREFIX.length), 10)
        if (Number.isFinite(sec)) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSeek(sec)
              }}
              className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[0.7rem] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer not-prose tabular-nums"
            >
              {children}
            </button>
          )
        }
      }
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    },
  }
}

interface MessageMarkdownProps {
  text: string
  onTimestampClick?: (seconds: number) => void
}

export const MessageMarkdown = memo(({ text, onTimestampClick }: MessageMarkdownProps) => {
  const components = useMemo(
    () => (onTimestampClick ? makeTimestampComponents(onTimestampClick) : undefined),
    [onTimestampClick],
  )
  if (onTimestampClick) {
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-[#080a0d]/50 [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap">
        <Streamdown components={components}>
          {linkifyTimestamps(text)}
        </Streamdown>
      </div>
    )
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-[#080a0d]/50 [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap">
      <Streamdown>{text}</Streamdown>
    </div>
  )
})
