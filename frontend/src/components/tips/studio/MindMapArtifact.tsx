import type { Edge, Node, NodeProps, NodeTypes } from '@xyflow/react'
import type { MindMapNode, StudioMindMapData } from '@/types/tips'
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import dagre from 'dagre'
import { ChevronLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { ChatTab } from '../tabs/ChatTab'
import '@xyflow/react/dist/style.css'

interface Props {
  data: StudioMindMapData
  courseId: string
  videoId: string
  lessonTitle: string
  transcript: string
}

interface FlatNode {
  id: string
  label: string
  parentId: string | null
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 44

function MindNode({ data }: NodeProps) {
  const { label } = data as { label: string }
  return (
    <div
      className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:border-primary transition-colors"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Handle type="target" position={Position.Left} className="bg-border! border-0! w-1.5! h-1.5!" />
      <span className="truncate px-1">{label}</span>
      <Handle type="source" position={Position.Right} className="bg-border! border-0! w-1.5! h-1.5!" />
    </div>
  )
}

const nodeTypes: NodeTypes = { mind: MindNode }

function flatten(root: MindMapNode): FlatNode[] {
  const out: FlatNode[] = []
  function walk(node: MindMapNode, parentId: string | null, path: string) {
    out.push({ id: path, label: node.label, parentId })
    node.children.forEach((child, i) => walk(child, path, `${path}.${i}`))
  }
  walk(root, null, '0')
  return out
}

function layout(flat: FlatNode[]): { nodes: Node[], edges: Edge[] } {
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
      data: { label: f.label },
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
    }
  })
  const edges: Edge[] = flat
    .filter(f => f.parentId !== null)
    .map(f => ({ id: `e-${f.parentId}-${f.id}`, source: f.parentId as string, target: f.id }))
  return { nodes, edges }
}

export function MindMapArtifact({ data, courseId, videoId, lessonTitle, transcript }: Props) {
  const { t } = useI18n()
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const flat = useMemo(() => flatten(data.root), [data])
  const { nodes, edges } = useMemo(() => layout(flat), [flat])

  if (flat.length <= 2) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t('tips.studio.mindmap.tooShort')}
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
            className="inline-flex items-center gap-1 text-xs text-primary font-bold cursor-pointer hover:underline"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
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
    <div className="h-full w-full">
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
  )
}
