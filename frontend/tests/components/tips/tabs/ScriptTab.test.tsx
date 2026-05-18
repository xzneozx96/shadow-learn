import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScriptTab } from '../../../../src/components/tips/tabs/ScriptTab'
import { _resetTipPlayerStoreForTests, publishTime, registerSeek } from '../../../../src/lib/tipPlayerStore'

vi.mock('@/contexts/I18nContext', async () => {
  const { getTranslation } = await import('@/lib/i18n')
  return { useI18n: () => ({ locale: 'en', setLocale: vi.fn(), t: getTranslation('en') }) }
})

afterEach(() => {
  _resetTipPlayerStoreForTests()
})

const segs = [
  { start: 0, end: 5, text: 'first' },
  { start: 5, end: 10, text: 'second' },
  { start: 10, end: 15, text: 'third' },
]

describe('scriptTab', () => {
  it('renders all segments with formatted timestamps', () => {
    render(<ScriptTab segments={segs} transcriptStatus="ready" />)
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
    expect(screen.getByText('third')).toBeInTheDocument()
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByText('00:05')).toBeInTheDocument()
  })

  it('highlights the segment matching the current player time', () => {
    render(<ScriptTab segments={segs} transcriptStatus="ready" />)
    act(() => { publishTime(7) })
    const secondRow = screen.getByText('second').closest('button')!
    expect(secondRow).toHaveAttribute('data-active', 'true')
    const firstRow = screen.getByText('first').closest('button')!
    expect(firstRow).toHaveAttribute('data-active', 'false')
  })

  it('clicking a row calls the registered seekTo with that segment start', async () => {
    const seekSpy = vi.fn()
    registerSeek(seekSpy)
    render(<ScriptTab segments={segs} transcriptStatus="ready" />)
    await userEvent.click(screen.getByText('second'))
    expect(seekSpy).toHaveBeenCalledWith(5)
  })

  it('shows disabled copy when transcript is unavailable', () => {
    render(<ScriptTab segments={[]} transcriptStatus="unavailable" />)
    expect(screen.getByText(/no transcript/i)).toBeInTheDocument()
  })

  it('shows empty-state copy when segments array is empty but transcript is ready', () => {
    render(<ScriptTab segments={[]} transcriptStatus="ready" />)
    expect(screen.getByText(/no transcript segments/i)).toBeInTheDocument()
  })
})
