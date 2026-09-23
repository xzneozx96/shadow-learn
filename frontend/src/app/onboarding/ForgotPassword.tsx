import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountCard, accountErrorKey } from '@/app/onboarding/AccountCard'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setLoading(true)
      await requestPasswordReset(email.trim())
      setSent(true)
    }
    catch (err) {
      setError(t(accountErrorKey(err)))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <AccountCard title={t('account.forgot.title')} subtitle={sent ? undefined : t('account.forgot.subtitle')}>
      {sent
        ? <p className="mt-6 text-center text-sm">{t('account.forgot.sent')}</p>
        : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
              <Input type="email" autoComplete="email" required placeholder={t('account.email')} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
              {error && <p className="text-center text-sm text-red-400">{error}</p>}
              <Button size="lg" type="submit" disabled={loading}>{t('account.forgot.submit')}</Button>
            </form>
          )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/" className="underline-offset-2 hover:underline">{t('account.backToLogin')}</Link>
      </p>
    </AccountCard>
  )
}
