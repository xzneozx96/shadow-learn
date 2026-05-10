type AmbientTone = 'emerald' | 'violet' | 'amber' | 'sky' | 'rose'

interface AmbientBackdropProps {
  url?: string | null
  tone?: AmbientTone
  height?: string
}

const TONE_GRADIENTS: Record<AmbientTone, string> = {
  emerald: 'from-emerald-500/30 via-teal-500/15 to-transparent',
  violet: 'from-violet-500/30 via-fuchsia-500/15 to-transparent',
  amber: 'from-amber-500/30 via-orange-500/15 to-transparent',
  sky: 'from-sky-500/30 via-blue-500/15 to-transparent',
  rose: 'from-rose-500/30 via-pink-500/15 to-transparent',
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
                className="w-full h-full object-cover scale-110 blur-3xl opacity-25 dark:opacity-20"
              />
              <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/85 to-background" />
            </>
          )
        : tone
          ? (
              <>
                <div className={`absolute inset-0 bg-radial-[at_50%_0%] ${TONE_GRADIENTS[tone]} blur-3xl opacity-60 dark:opacity-40`} />
                <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/60 to-background" />
              </>
            )
          : null}
    </div>
  )
}
