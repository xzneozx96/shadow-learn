import type { ReactNode } from 'react'
import type { TranslationKey } from '@/shared/lib/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

export const MIN_PASSWORD_LENGTH = 8

const ERROR_MESSAGES: Record<string, TranslationKey> = {
  LOGIN_BAD_CREDENTIALS: 'account.error.badCredentials',
  REGISTER_USER_ALREADY_EXISTS: 'account.error.userExists',
  REGISTER_INVALID_PASSWORD: 'account.error.passwordTooShort',
  RESET_PASSWORD_INVALID_PASSWORD: 'account.error.passwordTooShort',
  RESET_PASSWORD_BAD_TOKEN: 'account.error.badResetToken',
}

// eslint-disable-next-line react-refresh/only-export-components
export function accountErrorKey(err: unknown): TranslationKey {
  return (err instanceof Error && ERROR_MESSAGES[err.message]) || 'account.error.generic'
}

export function AccountCard({ title, subtitle, children }: { title: string, subtitle?: string, children: ReactNode }) {
  return (
    <div className="h-screen overflow-y-auto text-foreground px-4">
      <div className="min-h-full flex items-center justify-center py-10">
        <Card className="w-full max-w-sm px-6 py-10">
          <CardHeader>
            <CardTitle className="flex items-center flex-col gap-3 text-xl">
              <img src="/favicon.svg" className="size-8" alt="ShadowLearn Logo" />
              {title}
            </CardTitle>
            {subtitle && <CardDescription className="text-center">{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}
