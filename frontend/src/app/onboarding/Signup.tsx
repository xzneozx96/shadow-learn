import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountCard, accountErrorKey } from '@/app/onboarding/AccountCard'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const MIN_PASSWORD_LENGTH = 8

export function Signup() {
  const { signup } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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
      await signup(email.trim(), password)
    }
    catch (err) {
      setError(t(accountErrorKey(err)))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <AccountCard title={t('account.signup.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
        <Input type="email" autoComplete="email" required placeholder={t('account.email')} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <Input type="password" autoComplete="new-password" required placeholder={t('account.password')} value={password} onChange={e => setPassword(e.target.value)} />
        <Input type="password" autoComplete="new-password" required placeholder={t('account.confirmPassword')} value={confirm} onChange={e => setConfirm(e.target.value)} />
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <Button size="lg" type="submit" disabled={loading}>
          {loading ? t('account.signup.submitting') : t('account.signup.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('account.signup.haveAccount')}
        {' '}
        <Link to="/" className="text-foreground underline-offset-2 hover:underline">{t('account.login.submit')}</Link>
      </p>
    </AccountCard>
  )
}
