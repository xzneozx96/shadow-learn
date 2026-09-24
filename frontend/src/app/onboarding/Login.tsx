import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountCard, accountErrorKey } from '@/app/onboarding/AccountCard'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { PasswordInput } from '@/shared/ui/PasswordInput'

export function Login() {
  const { login } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setLoading(true)
      await login(email.trim(), password)
    }
    catch (err) {
      setError(t(accountErrorKey(err)))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <AccountCard title={t('account.login.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
        <Input type="email" autoComplete="email" required placeholder={t('account.email')} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <PasswordInput showLabel={t('account.showPassword')} hideLabel={t('account.hidePassword')} autoComplete="current-password" required placeholder={t('account.password')} value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <Button size="lg" type="submit" disabled={loading}>
          {loading ? t('account.login.submitting') : t('account.login.submit')}
        </Button>
      </form>
      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Link to="/forgot-password" className="underline-offset-2 hover:underline">{t('account.login.forgot')}</Link>
        <p>
          {t('account.login.noAccount')}
          {' '}
          <Link to="/signup" className="text-foreground underline-offset-2 hover:underline">{t('account.signup.submit')}</Link>
        </p>
      </div>
    </AccountCard>
  )
}
