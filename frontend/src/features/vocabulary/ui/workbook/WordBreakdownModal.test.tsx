import type { WordStory } from '@/db'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBreakdownStory } from '@/features/vocabulary/lib/api/breakdownStory'
import { WordBreakdownModal } from '@/features/vocabulary/ui/workbook/WordBreakdownModal'
import { FakeApiClient, fakeDataClient } from '../../../../../tests/fake-api'

vi.mock('@/features/vocabulary/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn().mockResolvedValue('Người thợ kéo sợi ...'),
}))

vi.mock('@/app/providers/I18nContext', async () => {
  const { getTranslation } = await import('@/shared/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

vi.mock('@/shared/hooks/useTTS', () => ({
  useTTS: () => ({ playTTS: vi.fn(), loadingText: null }),
}))

afterEach(() => {
  vi.mocked(fetchBreakdownStory).mockClear()
})

function renderModal(overrides = {}) {
  return render(
    <WordBreakdownModal
      open
      onClose={() => {}}
      word="学习"
      pinyin="xuéxí"
      meaning="to study"
      sourceLanguage="zh-CN"
      db={null}
      {...overrides}
    />,
  )
}

describe('wordBreakdownModal', () => {
  it('renders the word, pinyin, and meaning in the header', async () => {
    const db = fakeDataClient()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText('学习')).toBeInTheDocument()
      // Pinyin is wrapped in parens, split across elements — use regex
      expect(screen.getByText(/xuéxí/)).toBeInTheDocument()
      expect(screen.getByText('to study')).toBeInTheDocument()
    })
  })

  it('renders Sino-Vietnamese reading from local lookup', async () => {
    const db = fakeDataClient()
    renderModal({ db })
    await waitFor(() => {
      // "học" and "tập" expected from Unihan lookup for 学 and 习.
      // Appears in multiple places (header, per-char chip, anchor section).
      expect(screen.getAllByText(/học/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/tập/i).length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })

  it('renders the LLM story once it loads', async () => {
    const db = fakeDataClient()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText(/Người thợ kéo sợi/)).toBeInTheDocument()
    })
  })

  it('shows the user\'s own story instead of the shared one', async () => {
    const api = new FakeApiClient().seedStore('word-stories', [{ word: '学习', story: 'Câu chuyện của tôi', updatedAt: '2026-09-01' }])
    renderModal({ db: fakeDataClient(api) })
    await waitFor(() => expect(screen.getByText('Câu chuyện của tôi')).toBeInTheDocument(), { timeout: 5000 })
    expect(fetchBreakdownStory).not.toHaveBeenCalled()
  })

  it('saves an edited story to the account', async () => {
    const api = new FakeApiClient()
    renderModal({ db: fakeDataClient(api) })
    await waitFor(() => expect(screen.getByText(/Người thợ kéo sợi/)).toBeInTheDocument(), { timeout: 5000 })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByPlaceholderText('Write your own mnemonic story…')
    await userEvent.clear(box)
    await userEvent.type(box, 'Chuyện mới')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Chuyện mới')).toBeInTheDocument())
    expect(api.storeRows<WordStory>('word-stories')).toEqual([expect.objectContaining({ word: '学习', story: 'Chuyện mới' })])
  })

  it('regenerate forces a fresh story', async () => {
    const api = new FakeApiClient()
    renderModal({ db: fakeDataClient(api) })
    await waitFor(() => expect(screen.getByText(/Người thợ kéo sợi/)).toBeInTheDocument(), { timeout: 5000 })

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(fetchBreakdownStory).toHaveBeenCalledTimes(2))
    expect(vi.mocked(fetchBreakdownStory).mock.calls[1][0]).toEqual(expect.objectContaining({ word: '学习', force: true }))
  })
})
