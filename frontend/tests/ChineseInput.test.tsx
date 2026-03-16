import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChineseInput } from '@/components/ui/ChineseInput'

function setup(value = '', onChange = vi.fn()) {
  const { rerender } = render(
    <ChineseInput value={value} onChange={onChange} placeholder="Type..." />,
  )
  const input = screen.getByPlaceholderText('Type...')
  return { input, onChange, rerender }
}

describe('chineseInput', () => {
  it('renders the input with the provided value', () => {
    const { input } = setup('你好')
    expect((input as HTMLInputElement).value).toBe('你好')
  })

  it('shows candidates when a known syllable is typed', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    expect(screen.getByText('你')).toBeTruthy()
  })

  it('selects the first candidate on Space', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '你' }) }),
    )
  })

  it('selects the first candidate on Enter when candidates are visible', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '你' }) }),
    )
  })

  it('selects by number key', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: '2' })
    // second candidate for 'ni'
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '尼' }) }),
    )
  })

  it('clears buffer on Escape without calling onChange', () => {
    const { input, onChange } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('你')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('appends to existing value on candidate selection', () => {
    const { input, onChange } = setup('我')
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '我你' }) }),
    )
  })

  it('forwards Enter to onKeyDown when no candidates are visible', () => {
    const onKeyDown = vi.fn()
    const { getByPlaceholderText } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(getByPlaceholderText('Type...'), { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('does not call onKeyDown for letter keys going into buffer', () => {
    const onKeyDown = vi.fn()
    const { getByPlaceholderText } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(getByPlaceholderText('Type...'), { key: 'n' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('removes last char from buffer on Backspace', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: 'i' })
    fireEvent.keyDown(input, { key: 'Backspace' })
    // buffer is now 'n', candidates for 'n' alone — 'ni' candidates gone
    expect(screen.queryByText('你')).toBeNull()
  })

  it('does not forward Enter to onKeyDown when buffer is active but has no candidates', () => {
    // 'q' is not in the dict — buffer active, no candidates
    const onKeyDown = vi.fn()
    const { getByPlaceholderText } = render(
      <ChineseInput value="" onChange={vi.fn()} onKeyDown={onKeyDown} placeholder="Type..." />,
    )
    fireEvent.keyDown(getByPlaceholderText('Type...'), { key: 'q' })
    fireEvent.keyDown(getByPlaceholderText('Type...'), { key: 'Enter' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })
})
