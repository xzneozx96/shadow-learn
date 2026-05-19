import type { Edge, Node, NodeProps, NodeTypes } from '@xyflow/react'
import type { MindMapNode, StudioMindMapData } from '@/types/tips'
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import dagre from 'dagre'
import { ChevronLeft, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { escapeHtml } from '@/lib/htmlText'
import { seekTip } from '@/lib/tipSeekBus'
import { SaveToNotesButton } from '../notes/SaveToNotesButton'
import { ChatTab } from '../tabs/ChatTab'
import '@xyflow/react/dist/style.css'

interface Props {
  data: StudioMindMapData
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
  onBackToGrid: () => void
}

interface FlatNode {
  id: string
  label: string
  summary: string
  startSec: number | null
  parentId: string | null
}

const NODE_WIDTH = 200
const NODE_HEIGHT = 44

interface MindNodeData {
  label: string
  summary: string
  videoId: string
  pathRef: string
  startSec: number | null
  onSeek: (sec: number) => void
}

function MindNode({ data }: NodeProps) {
  const { label, summary, videoId, pathRef, startSec, onSeek } = data as unknown as MindNodeData
  return (
    <div
      className="group relative rounded-md border border-border bg-card text-xs font-medium text-foreground shadow-sm hover:border-primary transition-colors"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, display: 'flex', alignItems: 'center' }}
    >
      <Handle type="target" position={Position.Left} className="bg-border! border-0! w-1.5! h-1.5!" />
      <span className="truncate px-3 flex-1">{label}</span>
      {startSec !== null && (
        <button
          type="button"
          aria-label={`Jump to ${Math.floor(startSec / 60)}:${String(Math.floor(startSec % 60)).padStart(2, '0')}`}
          onClick={(e) => {
            e.stopPropagation()
            onSeek(startSec)
          }}
          className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
        >
          <Play className="size-3 fill-current" aria-hidden />
        </button>
      )}
      <div className="mr-1 flex-shrink-0">
        <SaveToNotesButton
          build={() => ({
            videoId,
            title: label.slice(0, 80),
            html: `<p><strong>${escapeHtml(label)}</strong></p>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}`,
            source: 'studio',
            sourceRef: { kind: 'mind_map', ref: pathRef },
          })}
          alwaysVisible
        />
      </div>
      <Handle type="source" position={Position.Right} className="bg-border! border-0! w-1.5! h-1.5!" />
    </div>
  )
}

const nodeTypes: NodeTypes = { mind: MindNode }

function flatten(root: MindMapNode): FlatNode[] {
  const out: FlatNode[] = []
  function walk(node: MindMapNode, parentId: string | null, path: string) {
    out.push({ id: path, label: node.label, summary: node.summary ?? '', startSec: node.start_sec ?? null, parentId })
    node.children.forEach((child, i) => walk(child, path, `${path}.${i}`))
  }
  walk(root, null, '0')
  return out
}

function layout(flat: FlatNode[], onSeek: (sec: number) => void, videoId: string): { nodes: Node[], edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 80 })
  g.setDefaultEdgeLabel(() => ({}))

  flat.forEach(f => g.setNode(f.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  flat.forEach((f) => {
    if (f.parentId !== null)
      g.setEdge(f.parentId, f.id)
  })

  dagre.layout(g)

  const nodes: Node[] = flat.map((f) => {
    const { x, y } = g.node(f.id)
    return {
      id: f.id,
      type: 'mind',
      data: { label: f.label, summary: f.summary, videoId, pathRef: f.id, startSec: f.startSec, onSeek },
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
    }
  })
  const edges: Edge[] = flat
    .filter(f => f.parentId !== null)
    .map(f => ({ id: `e-${f.parentId}-${f.id}`, source: f.parentId as string, target: f.id }))
  return { nodes, edges }
}

export function MindMapArtifact({ data, courseId, videoId, lessonTitle, transcript, onBackToGrid }: Props) {
  const { t } = useI18n()
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const flat = useMemo(() => flatten(data.root), [data])
  const { nodes, edges } = useMemo(() => layout(flat, seekTip, videoId), [flat, videoId])

  const studioBack = (
    <button
      type="button"
      onClick={onBackToGrid}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground font-bold cursor-pointer hover:underline"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {t('tips.studio.title')}
    </button>
  )

  if (flat.length <= 2) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3">{studioBack}</div>
        <div className="flex-1 p-6 text-center text-sm text-muted-foreground">
          {t('tips.studio.mindmap.tooShort')}
        </div>
      </div>
    )
  }

  if (pendingPrompt !== null) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3">
          <button
            type="button"
            data-testid="mindmap-back-to-tree"
            onClick={() => setPendingPrompt(null)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground font-bold cursor-pointer hover:underline"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t('tips.studio.mindmap.backToTree')}
          </button>
        </div>
        <div className="flex-1">
          <ChatTab
            courseId={courseId}
            videoId={videoId}
            lessonTitle={lessonTitle}
            transcript={transcript}
            transcriptStatus="ready"
            initialUserMessage={pendingPrompt}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3">{studioBack}</div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            const label = (node.data as { label: string }).label
            setPendingPrompt(t('tips.studio.mindmap.prefill', { label }))
          }}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
