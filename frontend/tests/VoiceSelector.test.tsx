import type { VoiceOption } from '../src/lib/voices'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceSelector } from '../src/components/voice/VoiceSelector'

const mockVoices: VoiceOption[] = [
  {
    id: 'voice-a',
    label: '声音 A',
    description: 'Voice A description',
    avatarUrl: '/voices/avatars/voice-a.png',
    previewUrl: '/voices/previews/voice-a.mp3',
  },
  {
    id: 'voice-b',
    label: '声音 B',
    description: 'Voice B description',
    avatarUrl: '/voices/avatars/voice-b.png',
    previewUrl: '/voices/previews/voice-b.mp3',
  },
]

let mockAudioPlay: ReturnType<typeof vi.fn>
let mockAudioPause: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockAudioPlay = vi.fn().mockResolvedValue(undefined)
  mockAudioPause = vi.fn()
  globalThis.Audio = vi.fn().mockImplementation(() => ({
    play: mockAudioPlay,
    pause: mockAudioPause,
    src: '',
  })) as any
})

describe('voiceSelector', () => {
  it('renders all voices', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    expect(screen.getByText('声音 A')).toBeInTheDocument()
    expect(screen.getByText('声音 B')).toBeInTheDocument()
  })

  it('calls onSelect when a row is clicked', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('声音 B'))
    expect(onSelect).toHaveBeenCalledWith('voice-b')
  })

  it('play button does NOT call onSelect', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    const playButtons = screen.getAllByRole('button', { name: /play/i })
    fireEvent.click(playButtons[1]) // click Voice B's play button
    expect(onSelect).not.toHaveBeenCalled()
  })
})
