type AmbientTone = 'emerald' | 'violet' | 'amber' | 'sky' | 'rose' | 'navy' | 'indigo'

interface AmbientBackdropProps {
  url?: string | null
  tone?: AmbientTone
  height?: string
}

const TONE_COLORS: Record<AmbientTone, { center: string, mid: string }> = {
  emerald: { center: 'rgba(16, 185, 129, 0.15)', mid: 'rgba(6, 78, 59, 0.05)' },
  violet: { center: 'rgba(139, 92, 246, 0.15)', mid: 'rgba(76, 29, 149, 0.05)' },
  amber: { center: 'rgba(245, 158, 11, 0.15)', mid: 'rgba(120, 53, 15, 0.05)' },
  sky: { center: 'rgba(14, 165, 233, 0.15)', mid: 'rgba(12, 74, 110, 0.05)' },
  rose: { center: 'rgba(244, 63, 94, 0.15)', mid: 'rgba(159, 18, 57, 0.05)' },
  navy: { center: 'rgba(59, 130, 246, 0.25)', mid: 'rgba(30, 27, 75, 0.15)' },
  indigo: { center: 'rgba(99, 102, 241, 0.18)', mid: 'rgba(49, 46, 129, 0.08)' },
}

export function AmbientBackdrop({ url, tone, height = 'h-[420px]' }: AmbientBackdropProps) {
  if (!url && !tone)
    return null

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 ${height} z-2`} style={{ maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
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
                {/* Secondary glow points for depth */}
                <div
                  className="absolute inset-0 blur-[100px] opacity-60"
                  style={{
                    background: `
                      radial-gradient(circle at 15% -10%, ${TONE_COLORS[tone].center} 0%, transparent 40%),
                      radial-gradient(circle at 85% -10%, ${TONE_COLORS[tone].center} 0%, transparent 40%),
                      radial-gradient(circle at 50% -20%, ${TONE_COLORS[tone].center} 0%, transparent 50%)
                    `,
                  }}
                />

                {/* Main ambient glow */}
                <div
                  className="absolute inset-0 blur-3xl"
                  style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${TONE_COLORS[tone].center}, ${TONE_COLORS[tone].mid} 40%, transparent 80%)`,
                  }}
                />

                {/* Grain Texture */}
                {/* <svg className="absolute inset-0 h-full w-full opacity-[0.15] mix-blend-overlay pointer-events-none">
                  <filter id="noiseFilter">
                    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
                  </filter>
                  <rect width="100%" height="100%" filter="url(#noiseFilter)" />
                </svg> */}
                <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/40 to-background" />
              </>
            )
          : null}
    </div>
  )
}
