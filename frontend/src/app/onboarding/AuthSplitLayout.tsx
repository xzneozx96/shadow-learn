import type { ReactNode } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { BrandLogo } from '@/shared/ui/BrandLogo'

export function AuthSplitLayout({ title, subtitle, children }: { title: string, subtitle: string, children: ReactNode }) {
  const { t } = useI18n()

  return (
    <main className="h-full overflow-y-auto bg-[#10111d] text-foreground">
      <div className="grid min-h-full lg:grid-cols-[minmax(0,47%)_minmax(0,53%)]">
        <section className="order-2 flex min-h-[calc(100dvh-180px)] flex-col px-6 pb-10 pt-8 sm:px-10 lg:order-1 lg:min-h-[100dvh] lg:px-12 lg:py-10 xl:px-16">
          <BrandLogo />

          <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center py-12 lg:py-16">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-[2.7rem]">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{subtitle}</p>
            {children}
          </div>

          <p className="text-xs text-muted-foreground/70">
            ©
            {' '}
            {new Date().getFullYear()}
            {' '}
            ShadowLearn
          </p>
        </section>

        <aside className="relative order-1 h-[180px] overflow-hidden bg-[#20253c] lg:sticky lg:top-0 lg:order-2 lg:h-[100dvh] lg:self-start" aria-label={t('account.auth.imageDescription')}>
          <img
            src="/auth-study-hero.webp"
            alt=""
            className="absolute inset-0 size-full object-cover object-[center_43%] lg:object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020]/95 via-[#0b1020]/10 to-transparent" />
          <div className="absolute bottom-10 left-10 right-10 hidden max-w-lg lg:block xl:bottom-16 xl:left-16 xl:right-16">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">{t('account.auth.heroTitle')}</h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">{t('account.auth.heroDescription')}</p>
          </div>
        </aside>
      </div>
    </main>
  )
}
