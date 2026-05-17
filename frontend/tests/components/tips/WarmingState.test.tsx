import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WarmingState } from '@/components/tips/WarmingState'

function rowState(label: string | RegExp): string | null {
  const el = screen.getByText(label).closest('[data-step]')
  return el?.getAttribute('data-state') ?? null
}

describe('warmingState', () => {
  it('folds video_download into the Fetching media step', () => {
    render(<WarmingState step="video_download" />)
    expect(rowState(/fetching media/i)).toBe('active')
    expect(rowState(/transcribing/i)).toBe('pending')
    expect(rowState(/indexing/i)).toBe('pending')
  })

  it('keeps the same Fetching media row active during audio_extraction', () => {
    render(<WarmingState step="audio_extraction" />)
    expect(rowState(/fetching media/i)).toBe('active')
  })

  it('advances to Transcribing', () => {
    render(<WarmingState step="transcription" />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('active')
    expect(rowState(/indexing/i)).toBe('pending')
  })

  it('advances to Indexing', () => {
    render(<WarmingState step="indexing" />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('done')
    expect(rowState(/indexing/i)).toBe('active')
  })

  it('marks every row done when complete=true', () => {
    render(<WarmingState step="indexing" complete />)
    expect(rowState(/fetching media/i)).toBe('done')
    expect(rowState(/transcribing/i)).toBe('done')
    expect(rowState(/indexing/i)).toBe('done')
  })
})
