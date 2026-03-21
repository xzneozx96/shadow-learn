import type { ReactNode } from 'react'
import type { Locale, TranslationKey } from '@/lib/i18n'
import { createContext, use, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSettings, saveSettings } from '@/db'
import { getTranslation } from '@/lib/i18n'

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void> // async: writes to IDB
  t: (key: TranslationKey) => string
}

// eslint-disable-next-line react-refresh/only-export-components
export const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  setLocale: async () => {},
  t: getTranslation('vi'),
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const { db } = useAuth()
  const [localeState, setLocaleState] = useState<Locale>('vi')

  // Hydrate locale from IDB once db is available
  useEffect(() => {
    if (!db)
      return
    getSettings(db).then(s => setLocaleState(s?.uiLanguage ?? 'vi'))
  }, [db])

  async function setLocale(newLocale: Locale) {
    if (!db)
      return
    const current = await getSettings(db)
    await saveSettings(db, {
      ...(current ?? { translationLanguage: '' }),
      uiLanguage: newLocale,
    })
    setLocaleState(newLocale)
  }

  return (
    <I18nContext value={{ locale: localeState, setLocale, t: getTranslation(localeState) }}>
      {children}
    </I18nContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  return use(I18nContext)
}
