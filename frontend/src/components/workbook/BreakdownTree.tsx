import type { NodeProps } from '@xyflow/react'
import type { CharNodeData, CompNodeData, NodeData, WordNodeData } from './breakdownTreeLayout'
import type { CharData } from '@/lib/hanzi/types'
import { Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import { Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { buildGraph } from './breakdownTreeLayout'
import '@xyflow/react/dist/style.css'

// ─── Custom node component ────────────────────────────────────────────────────

function BreakdownNode({ data }: NodeProps) {
  const nodeData = data as NodeData
  const handleClass = '!w-0 !h-0 !min-w-0 !min-h-0 !opacity-0 !border-0 !p-0'

  if (nodeData.kind === 'word') {
    const d = nodeData as WordNodeData
    const showSino = d.sinoVietnamese && !d.sinoVietnamese.includes('?')
    return (
      <div className="bg-primary/15 border border-primary/40 ring-1 ring-primary/20 rounded-xl px-3.5 py-2 text-center min-w-[80px] shadow-sm">
        <Handle type="source" position={Position.Bottom} className={handleClass} />
        <div className="text-2xl font-bold font-serif leading-none text-foreground">{d.char}</div>
        <div className="mt-1.5 flex items-center justify-center gap-1 flex-wrap">
          {d.pinyin && <span className="text-[10px] italic text-yellow-500">{d.pinyin}</span>}
          {showSino && (
            <>
              {d.pinyin && <span className="text-[9px] text-foreground/30">·</span>}
              <span className="text-[10px] font-bold text-emerald-500">{d.sinoVietnamese}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  if (nodeData.kind === 'char') {
    const d = nodeData as CharNodeData
    const showSino = d.sinoVietnamese && !d.sinoVietnamese.includes('?')
    return (
      <div className="bg-card border border-border rounded-xl px-3.5 py-2 text-center min-w-[72px] shadow-sm">
        <Handle type="target" position={Position.Top} className={handleClass} />
        <Handle type="source" position={Position.Bottom} className={handleClass} />
        <div className="text-xl font-bold font-serif leading-none text-foreground">{d.char}</div>
        <div className="mt-1.5 flex items-center justify-center gap-1 flex-wrap">
          {d.pinyin && <span className="text-[10px] italic text-yellow-500">{d.pinyin}</span>}
          {showSino && (
            <>
              {d.pinyin && <span className="text-[9px] text-foreground/30">·</span>}
              <span className="text-[10px] font-bold text-emerald-500">{d.sinoVietnamese}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const d = nodeData as CompNodeData
  const showName = d.name && d.name !== d.char
  return (
    <div className="bg-card/60 border border-border rounded-xl px-3 py-1.5 text-center min-w-[60px] shadow-sm">
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="text-lg font-bold font-serif leading-none text-foreground">{d.char}</div>
      <div className="mt-1 flex items-center justify-center gap-0.5 flex-wrap">
        {d.pinyin && <span className="text-[9px] italic text-yellow-500">{d.pinyin}</span>}
        {showName && (
          <>
            {d.pinyin && <span className="text-[8px] text-foreground/30">·</span>}
            <span className="text-[9px] font-bold text-emerald-500">{d.name}</span>
          </>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { breakdownNode: BreakdownNode }

// ─── Public component ─────────────────────────────────────────────────────────

interface BreakdownTreeProps {
  word: string
  pinyin: string
  sinoVietnamese: string | null
  characters: CharData[]
  loading: boolean
}

export function BreakdownTree({ word, pinyin, sinoVietnamese, characters, loading }: BreakdownTreeProps) {
  const { t } = useI18n()

  const { nodes, edges, height } = useMemo(
    () => buildGraph(word, pinyin, sinoVietnamese, characters),
    [word, pinyin, sinoVietnamese, characters],
  )

  if (loading && characters.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/50">
        <Loader2 className="size-4 animate-spin" />
        {t('breakdown.analyzing')}
      </div>
    )
  }

  if (characters.length === 0)
    return null

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-border/30 [&_.react-flow__attribution]:hidden"
      style={{ height: Math.max(height + 48, 320) }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent!"
        style={{ background: 'transparent' }}
      >
        <Controls
          showInteractive={false}
          className="[&>button]:bg-card! [&>button]:border-border! [&>button]:text-foreground/70! [&>button:hover]:bg-secondary!"
        />
      </ReactFlow>
    </div>
  )
}
