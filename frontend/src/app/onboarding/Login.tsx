import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { accountErrorKey } from '@/app/onboarding/AccountCard'
import { AuthSplitLayout } from '@/app/onboarding/AuthSplitLayout'
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
    <AuthSplitLayout title={t('account.login.title')} subtitle={t('account.login.subtitle')}>
      <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-5">
        <div className="space-y-2">
          <label htmlFor="login-email" className="text-sm font-semibold">{t('account.email')}</label>
          <Input id="login-email" className="h-12 bg-white/[0.035] px-4" type="email" autoComplete="email" required placeholder={t('account.email')} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="text-sm font-semibold">{t('account.password')}</label>
            <Link to="/forgot-password" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">{t('account.login.forgot')}</Link>
          </div>
          <PasswordInput id="login-password" className="h-12 bg-white/[0.035] px-4" showLabel={t('account.showPassword')} hideLabel={t('account.hidePassword')} autoComplete="current-password" required placeholder={t('account.password')} value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <Button className="mt-2 h-12 text-base font-bold" size="lg" type="submit" disabled={loading}>
          {loading ? t('account.login.submitting') : t('account.login.submit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('account.login.noAccount')}
        {' '}
        <Link to="/signup" className="font-bold text-primary underline-offset-2 hover:underline">{t('account.signup.submit')}</Link>
      </p>
    </AuthSplitLayout>
  )
}
