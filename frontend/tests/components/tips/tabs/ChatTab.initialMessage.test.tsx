import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatTab } from '@/features/learning-materials/ui/tips/tabs/ChatTab'

const sendSpy = vi.fn()

vi.mock('@/features/agent/application/useZoberChat', () => ({
  useZoberChat: () => ({
    isHistoryLoading: false,
    systemPrompt: '',
    messages: [],
    sendMessage: sendSpy,
    status: 'ready',
    disabled: false,
    disabledReason: null,
  }),
}))

vi.mock('@/app/providers/I18nContext', () => ({
  useI18n: () => ({ locale: 'en', t: (k: string) => k }),
}))

vi.mock('@/features/agent/application/useVoiceInput', () => ({
  useVoiceInput: () => ({ state: 'idle', error: null, start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('@/features/learning-materials/lib/tipSeekBus', () => ({
  seekTip: vi.fn(),
}))

describe('chatTab initialUserMessage', () => {
  it('auto-sends the initial message once on mount when prop set', () => {
    sendSpy.mockClear()
    render(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
        initialUserMessage="Explain 'X' from this video"
      />,
    )
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith({ text: 'Explain \'X\' from this video' })
  })

  it('does not send when prop absent', () => {
    sendSpy.mockClear()
    render(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
      />,
    )
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('does not re-send on rerender with same prop value', () => {
    sendSpy.mockClear()
    const { rerender } = render(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
        initialUserMessage="P"
      />,
    )
    rerender(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
        initialUserMessage="P"
      />,
    )
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('sends again when prop value changes to a new string', () => {
    sendSpy.mockClear()
    const { rerender } = render(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
        initialUserMessage="A"
      />,
    )
    rerender(
      <ChatTab
        courseId="c1"
        videoId="v1"
        lessonTitle="L"
        transcript="t"
        transcriptStatus="ready"
        initialUserMessage="B"
      />,
    )
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy.mock.calls[1][0]).toEqual({ text: 'B' })
  })
})
