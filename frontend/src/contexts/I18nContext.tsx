import { createContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSettings, saveSettings } from '@/db'
import { getTranslation } from '@/lib/i18n'
import type { Locale, TranslationKey } from '@/lib/i18n'

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>  // async: writes to IDB
  t: (key: TranslationKey) => string
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  setLocale: async () => {},
  t: getTranslation('vi'),
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const { db } = useAuth()
  const [locale, setLocaleState] = useState<Locale>('vi')

  // Hydrate locale from IDB once db is available
  useEffect(() => {
    if (!db) return
    getSettings(db).then(s => setLocaleState(s?.uiLanguage ?? 'vi'))
  }, [db])

  async function setLocale(newLocale: Locale) {
    if (!db) return
    const current = await getSettings(db)
    await saveSettings(db, {
      ...(current ?? { translationLanguage: '' }),
      uiLanguage: newLocale,
    })
    setLocaleState(newLocale)
  }

  return (
    <I18nContext value={{ locale, setLocale, t: getTranslation(locale) }}>
      {children}
    </I18nContext>
  )
}
