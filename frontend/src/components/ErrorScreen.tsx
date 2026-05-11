import { ChevronDown, Home, RotateCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  error: unknown
  onRetry?: () => void
}

function formatError(error: unknown): { title: string, message: string, stack?: string } {
  if (error instanceof Error) {
    return { title: error.name || 'Error', message: error.message, stack: error.stack }
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as { status?: number, statusText?: string, data?: unknown, message?: string }
    if (obj.status) {
      return {
        title: `${obj.status} ${obj.statusText ?? ''}`.trim(),
        message: typeof obj.data === 'string' ? obj.data : (obj.message ?? 'Route error'),
      }
    }
    if (obj.message)
      return { title: 'Error', message: obj.message }
  }
  return { title: 'Error', message: String(error) }
}

export function ErrorScreen({ error, onRetry }: Props) {
  const [showStack, setShowStack] = useState(false)
  const { title, message, stack } = formatError(error)
  const isDev = import.meta.env.DEV

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, hsl(var(--destructive) / 0.12), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-destructive/40 to-transparent"
      />

      <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
        {/* glow halo behind card */}
        <div
          aria-hidden
          className="absolute -inset-px rounded-3xl bg-linear-to-b from-destructive/30 via-destructive/5 to-transparent blur-md"
        />
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-2xl backdrop-blur-xl">
          {/* top accent bar */}
          <div className="h-px bg-linear-to-r from-transparent via-destructive/60 to-transparent" />

          <div className="p-8">
            {/* icon */}
            <div className="relative mb-6 flex size-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-2xl bg-destructive/20" style={{ animationDuration: '2.5s' }} />
              <span className="absolute inset-0 rounded-2xl bg-linear-to-br from-destructive/25 to-destructive/5 ring-1 ring-destructive/30" />
              <TriangleAlert className="relative size-6 text-destructive" strokeWidth={2.25} />
            </div>

            {/* heading */}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Something went wrong.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              An unexpected error interrupted this page. You can retry, reload, or head back home.
            </p>

            {/* error detail */}
            <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-destructive/15 px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive">
                  {title}
                </span>
              </div>
              <p className="mt-1.5 wrap-break-word font-mono text-xs leading-relaxed text-foreground/90">
                {message}
              </p>
            </div>

            {/* actions */}
            <div className="mt-6 flex flex-wrap gap-2">
              {onRetry && (
                <Button onClick={onRetry} className="gap-1.5 shadow-sm">
                  <RotateCcw className="size-4" />
                  Try again
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-1.5"
              >
                <RotateCcw className="size-4" />
                Reload page
              </Button>
              <Button
                variant="ghost"
                onClick={() => { window.location.href = '/' }}
                className="gap-1.5"
              >
                <Home className="size-4" />
                Go home
              </Button>
            </div>

            {/* dev stack */}
            {isDev && stack && (
              <div className="mt-6 border-t border-border/60 pt-4">
                <button
                  type="button"
                  onClick={() => setShowStack(s => !s)}
                  className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      showStack && 'rotate-180',
                    )}
                  />
                  {showStack ? 'Hide' : 'Show'}
                  {' '}
                  stack trace
                  <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground/80">
                    dev
                  </span>
                </button>
                {showStack && (
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border/50 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* footer hint */}
        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          If this keeps happening, your data is safe — try reloading.
        </p>
      </div>
    </div>
  )
}
