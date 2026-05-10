type AmbientTone = 'emerald' | 'violet' | 'amber' | 'sky' | 'rose'

interface AmbientBackdropProps {
  url?: string | null
  tone?: AmbientTone
  height?: string
}

const TONE_COLORS: Record<AmbientTone, { center: string, mid: string }> = {
  emerald: { center: 'rgba(16, 185, 129, 0.45)', mid: 'rgba(20, 184, 166, 0.20)' },
  violet: { center: 'rgba(139, 92, 246, 0.45)', mid: 'rgba(217, 70, 239, 0.20)' },
  amber: { center: 'rgba(245, 158, 11, 0.45)', mid: 'rgba(249, 115, 22, 0.20)' },
  sky: { center: 'rgba(14, 165, 233, 0.45)', mid: 'rgba(59, 130, 246, 0.20)' },
  rose: { center: 'rgba(244, 63, 94, 0.45)', mid: 'rgba(236, 72, 153, 0.20)' },
}

export function AmbientBackdrop({ url, tone, height = 'h-[420px]' }: AmbientBackdropProps) {
  if (!url && !tone)
    return null

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 ${height} overflow-hidden z-0`}>
      {url
        ? (
            <>
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover scale-110 blur-3xl opacity-40 dark:opacity-35"
              />
              <div className="absolute inset-0 bg-linear-to-b from-background/30 via-background/75 to-background" />
            </>
          )
        : tone
          ? (
              <>
                <div
                  className="absolute inset-0 blur-3xl"
                  style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${TONE_COLORS[tone].center}, ${TONE_COLORS[tone].mid} 40%, transparent 70%)`,
                  }}
                />
                <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/50 to-background" />
              </>
            )
          : null}
    </div>
  )
}
