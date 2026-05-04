import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WordBreakdownModal } from '@/components/workbook/WordBreakdownModal'
import { initDB } from '@/db'
import 'fake-indexeddb/auto'

vi.mock('@/lib/api/breakdownStory', () => ({
  fetchBreakdownStory: vi.fn().mockResolvedValue('Người thợ kéo sợi ...'),
}))

afterEach(() => {
  // @ts-expect-error injected
  globalThis.indexedDB = new IDBFactory()
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
      openrouterApiKey="sk-test"
      {...overrides}
    />,
  )
}

describe('wordBreakdownModal', () => {
  it('renders the word, pinyin, and meaning in the header', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText('学习')).toBeInTheDocument()
      expect(screen.getByText('xuéxí')).toBeInTheDocument()
      expect(screen.getByText('to study')).toBeInTheDocument()
    })
  })

  it('renders Sino-Vietnamese reading from local lookup', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      // "học" and "tập" expected from Unihan lookup for 学 and 习
      expect(screen.getByText(/học/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('renders the LLM story once it loads', async () => {
    const db = await initDB()
    renderModal({ db })
    await waitFor(() => {
      expect(screen.getByText(/Người thợ kéo sợi/)).toBeInTheDocument()
    })
  })
})
