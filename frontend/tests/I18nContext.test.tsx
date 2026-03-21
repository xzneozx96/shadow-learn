import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { use } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nContext, I18nProvider } from '@/contexts/I18nContext'
import { initDB, saveSettings } from '@/db'
import 'fake-indexeddb/auto'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ db: (globalThis as any).__testDb }),
}))

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as any).__testDb = await initDB()
})

// Consumer component
function LocaleConsumer() {
  const { locale, t } = use(I18nContext)
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="label">{t('common.save')}</span>
    </div>
  )
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

describe('I18nProvider', () => {
  it('defaults to vi when no uiLanguage in IDB', async () => {
    render(<LocaleConsumer />, { wrapper })
    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('vi')
    })
  })

  it('t() returns Vietnamese string when locale is vi', async () => {
    render(<LocaleConsumer />, { wrapper })
    await waitFor(() => {
      expect(screen.getByTestId('label')).toHaveTextContent('Lưu')
    })
  })

  it('hydrates locale from IDB when uiLanguage is saved as en', async () => {
    const db = (globalThis as any).__testDb
    await saveSettings(db, { translationLanguage: 'zh', uiLanguage: 'en' })

    render(<LocaleConsumer />, { wrapper })
    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('en')
      expect(screen.getByTestId('label')).toHaveTextContent('Save')
    })
  })
})
