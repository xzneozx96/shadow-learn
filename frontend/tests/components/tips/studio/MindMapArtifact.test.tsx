import type { StudioMindMapData } from '@/types/tips'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MindMapArtifact } from '@/components/tips/studio/MindMapArtifact'

vi.mock('@/components/tips/tabs/ChatTab', () => ({
  ChatTab: ({ initialUserMessage }: { initialUserMessage?: string }) => (
    <div data-testid="chat-panel">{initialUserMessage ?? ''}</div>
  ),
}))

vi.mock('@/lib/tipSeekBus', () => ({
  seekTip: vi.fn(),
  registerTipSeek: vi.fn(() => () => {}),
}))

vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (k: string, params?: Record<string, string>) => {
      // Stand-in translations matching what Task 8 will define in i18n.ts.
      const dict: Record<string, string> = {
        'tips.studio.mindmap.tooShort': 'This Tip is too short for a Mind Map. Try a longer video.',
        'tips.studio.mindmap.backToTree': 'Back to tree',
        'tips.studio.mindmap.prefill': 'Explain \'{label}\' from this video.',
      }
      let text = dict[k] ?? k
      if (params)
        Object.entries(params).forEach(([key, v]) => { text = text.split(`{${key}}`).join(String(v)) })
      return text
    },
  }),
}))

// react-flow relies on ResizeObserver + SVG APIs not available in jsdom.
// We mock @xyflow/react to render a simple DOM tree so testing-library can
// find node labels and fire click events without a browser environment.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, onNodeClick }: any) => (
    <div data-testid="react-flow">
      {nodes.map((n: any) => (
        <div key={n.id} onClick={() => onNodeClick?.({}, n)}>{n.data.label}</div>
      ))}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}))

const tree: StudioMindMapData = {
  root: {
    label: 'Tones',
    summary: 'Overview of Mandarin tones',
    children: [
      { label: 'First tone', summary: 'High flat', children: [] },
      { label: 'Second tone', summary: 'Rising', children: [] },
    ],
  },
}

const baseProps = {
  data: tree,
  courseId: 'c1',
  videoId: 'v1',
  lessonTitle: 'Lesson',
  transcript: 'transcript',
}

describe('mindMapArtifact', () => {
  it('renders all node labels', () => {
    render(<MindMapArtifact {...baseProps} />)
    expect(screen.getByText('Tones')).toBeInTheDocument()
    expect(screen.getByText('First tone')).toBeInTheDocument()
    expect(screen.getByText('Second tone')).toBeInTheDocument()
  })

  it('clicking a node opens chat mode with prefilled prompt about that node', () => {
    render(<MindMapArtifact {...baseProps} />)
    fireEvent.click(screen.getByText('First tone'))
    const chat = screen.getByTestId('chat-panel')
    expect(chat).toBeInTheDocument()
    expect(chat.textContent).toMatch(/First tone/)
    expect(chat.textContent).toMatch(/from this video/i)
  })

  it('back button from chat mode returns to tree view', () => {
    render(<MindMapArtifact {...baseProps} />)
    fireEvent.click(screen.getByText('Tones'))
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mindmap-back-to-tree'))
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument()
    expect(screen.getByText('Tones')).toBeInTheDocument()
  })

  it('shows fallback message when tree has 2 or fewer nodes', () => {
    const tiny: StudioMindMapData = {
      root: { label: 'Solo', summary: 'just one', children: [] },
    }
    render(<MindMapArtifact {...baseProps} data={tiny} />)
    expect(screen.getByText(/too short/i)).toBeInTheDocument()
  })
})
