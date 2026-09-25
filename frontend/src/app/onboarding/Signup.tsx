import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { accountErrorKey, MIN_PASSWORD_LENGTH } from '@/app/onboarding/AccountCard'
import { AuthSplitLayout } from '@/app/onboarding/AuthSplitLayout'
import { useAuth } from '@/app/providers/AuthContext'
import { useI18n } from '@/app/providers/I18nContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { PasswordInput } from '@/shared/ui/PasswordInput'

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
    <AuthSplitLayout title={t('account.signup.title')} subtitle={t('account.signup.subtitle')}>
      <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-5">
        <div className="space-y-2">
          <label htmlFor="signup-email" className="text-sm font-semibold">{t('account.email')}</label>
          <Input id="signup-email" className="h-12 bg-white/[0.035] px-4" type="email" autoComplete="email" required placeholder={t('account.email')} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="space-y-2">
          <label htmlFor="signup-password" className="text-sm font-semibold">{t('account.password')}</label>
          <PasswordInput id="signup-password" className="h-12 bg-white/[0.035] px-4" showLabel={t('account.showPassword')} hideLabel={t('account.hidePassword')} autoComplete="new-password" required placeholder={t('account.password')} value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="signup-confirm" className="text-sm font-semibold">{t('account.confirmPassword')}</label>
          <PasswordInput id="signup-confirm" className="h-12 bg-white/[0.035] px-4" showLabel={t('account.showPassword')} hideLabel={t('account.hidePassword')} autoComplete="new-password" required placeholder={t('account.confirmPassword')} value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <Button className="mt-2 h-12 text-base font-bold" size="lg" type="submit" disabled={loading}>
          {loading ? t('account.signup.submitting') : t('account.signup.submit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('account.signup.haveAccount')}
        {' '}
        <Link to="/" className="font-bold text-primary underline-offset-2 hover:underline">{t('account.login.submit')}</Link>
      </p>
    </AuthSplitLayout>
  )
}
