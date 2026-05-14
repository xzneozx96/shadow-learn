import type { VoiceOption } from '../src/lib/voices'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceSelector } from '../src/components/voice/VoiceSelector'

const mockVoices: VoiceOption[] = [
  {
    id: 'voice-a',
    label: '声音 A',
    description: 'Voice A description',
    avatarUrl: '/voices/avatars/voice-a.png',
    sampleAudio: '/voices/previews/voice-a.mp3',
  },
  {
    id: 'voice-b',
    label: '声音 B',
    description: 'Voice B description',
    avatarUrl: '/voices/avatars/voice-b.png',
    sampleAudio: '/voices/previews/voice-b.mp3',
  },
]

let mockAudioPlay: ReturnType<typeof vi.fn>
let mockAudioPause: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockAudioPlay = vi.fn().mockResolvedValue(undefined)
  mockAudioPause = vi.fn()
  vi.stubGlobal('Audio', function MockAudio(this: any) {
    this.play = mockAudioPlay
    this.pause = mockAudioPause
    this.addEventListener = vi.fn()
    this.src = ''
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: /声音 A/i }))
}

describe('voiceSelector', () => {
  it('renders all voices', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    openPopover()
    expect(screen.getAllByText('声音 A').length).toBeGreaterThan(0)
    expect(screen.getByText('声音 B')).toBeInTheDocument()
  })

  it('calls onSelect when a row is clicked', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    openPopover()
    fireEvent.click(screen.getByText('声音 B'))
    expect(onSelect).toHaveBeenCalledWith('voice-b')
  })

  it('play button does NOT call onSelect', () => {
    const onSelect = vi.fn()
    render(<VoiceSelector voices={mockVoices} selectedId="voice-a" onSelect={onSelect} />)
    openPopover()
    const playButtons = screen.getAllByRole('button', { name: /play preview/i })
    fireEvent.click(playButtons[1]) // click Voice B's play button
    expect(onSelect).not.toHaveBeenCalled()
  })
})
