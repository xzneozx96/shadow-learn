interface AmbientBackdropProps {
  url: string
  height?: string
}

export function AmbientBackdrop({ url, height = 'h-[420px]' }: AmbientBackdropProps) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 ${height} overflow-hidden z-0`}>
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover scale-110 blur-3xl opacity-25 dark:opacity-20"
      />
      <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/85 to-background" />
    </div>
  )
}
