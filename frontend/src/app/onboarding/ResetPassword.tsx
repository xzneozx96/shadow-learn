import type { FormEvent } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AccountCard, accountErrorKey } from '@/app/onboarding/AccountCard'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const MIN_PASSWORD_LENGTH = 8

export function ResetPassword() {
  const { resetPassword } = useAuth()
  const { t } = useI18n()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('account.error.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('account.error.passwordMismatch'))
      return
    }
    try {
      setLoading(true)
      await resetPassword(token, password)
      setDone(true)
    }
    catch (err) {
      setError(t(accountErrorKey(err)))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <AccountCard title={t('account.reset.title')}>
      {done
        ? <p className="mt-6 text-center text-sm">{t('account.reset.done')}</p>
        : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
              <Input type="password" autoComplete="new-password" required placeholder={t('account.newPassword')} value={password} onChange={e => setPassword(e.target.value)} autoFocus />
              <Input type="password" autoComplete="new-password" required placeholder={t('account.confirmPassword')} value={confirm} onChange={e => setConfirm(e.target.value)} />
              {error && <p className="text-center text-sm text-red-400">{error}</p>}
              <Button size="lg" type="submit" disabled={loading || !token}>{t('account.reset.submit')}</Button>
            </form>
          )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {/* A full load, because the app gate picks its screen from the URL only on render. */}
        <a href="/" className="underline-offset-2 hover:underline">{t('account.backToLogin')}</a>
      </p>
    </AccountCard>
  )
}
