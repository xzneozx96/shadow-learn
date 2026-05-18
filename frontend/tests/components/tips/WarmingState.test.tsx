import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WarmingState } from '@/components/tips/WarmingState'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

function rowState(label: string | RegExp): string | null {
  const el = screen.getByText(label).closest('[data-step]')
  return el?.getAttribute('data-state') ?? null
}

describe('warmingState', () => {
  it('queued maps to Fetching media (active)', () => {
    render(<WarmingState step="queued" />)
    expect(rowState(/fetching media/i)).toBe('active')
    expect(rowState(/transcribing/i)).toBe('pending')
  })

  it('folds video_download into the Fetching media step', () => {
    render(<WarmingState step="video_download" />)
    expect(rowState(/fetching media/i)).toBe('active')
    expect(rowState(/transcribing/i)).toBe('pending')
  })

  it('keeps the same Fetching media row active during audio_extraction', () => {
    render(<WarmingState step="audio_extraction" />)
    expect(rowState(/fetching media/i)).toBe('active')
  })

  it('advances to Transcribing', () => {
    render(<WarmingState step="transcription" />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('active')
  })

  it('indexing keeps the Transcribing row active (phantom backend step)', () => {
    render(<WarmingState step="indexing" />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('active')
  })

  it('marks every row done when complete=true', () => {
    render(<WarmingState step="transcription" complete />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('done')
  })

  it('does not render an Indexing row', () => {
    render(<WarmingState step="transcription" />)
    expect(screen.queryByText(/indexing/i)).not.toBeInTheDocument()
  })
})
