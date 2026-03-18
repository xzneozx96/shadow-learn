import type { FormEvent } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export function Unlock() {
  const { unlock, resetKeys } = useAuth()

  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!pin) {
      setError('Please enter your PIN.')
      return
    }

    try {
      setLoading(true)
      await unlock(pin)
    }
    catch {
      setError('Incorrect PIN. Please try again.')
      toast.error('Incorrect PIN')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    await resetKeys()
  }

  return (
    <div className="flex h-screen items-center justify-center glass-bg text-foreground px-4">
      <Card className="w-full max-w-sm px-10 py-20">
        <CardHeader>
          <CardTitle className="flex items-center flex-col gap-3 text-xl">
            <img src="/favicon.svg" className="size-8" alt="ShadowLearn Logo" />
            ShadowLearn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-10">
            <Input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="text-center tracking-widest"
              autoFocus
            />

            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? 'Unlocking...' : 'Unlock'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowReset(!showReset)}
              className="text-sm text-white/40 underline-offset-2 hover:text-white/65 hover:underline"
            >
              Forgot PIN?
            </button>

            {showReset && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <p className="mb-2">
                  This will delete all stored API keys. You will need to re-enter them.
                </p>
                <Button variant="destructive" size="sm" onClick={handleReset}>
                  Reset Keys
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
