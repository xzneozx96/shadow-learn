import type { NodeProps } from '@xyflow/react'
import type { CharNodeData, CompNodeData, NodeData, WordNodeData } from './breakdownTreeLayout'
import type { CharData } from '@/shared/lib/hanzi/types'
import { Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import { Loader2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/app/providers/I18nContext'
import { buildGraph } from './breakdownTreeLayout'
import '@xyflow/react/dist/style.css'

// ─── Custom node component ────────────────────────────────────────────────────

function BreakdownNode({ data }: NodeProps) {
  const nodeData = data as NodeData
  const { t } = useI18n()
  const handleClass = '!w-0 !h-0 !min-w-0 !min-h-0 !opacity-0 !border-0 !p-0'

  if (nodeData.kind === 'word') {
    const d = nodeData as WordNodeData
    const showSino = d.sinoVietnamese && !d.sinoVietnamese.includes('?')
    return (
      <div className="bg-primary/15 border border-primary/40 ring-1 ring-primary/20 rounded-xl px-3.5 py-2 text-center min-w-[80px] shadow-sm">
        <Handle type="source" position={Position.Bottom} className={handleClass} />
        <div className="text-2xl font-bold font-serif leading-none text-foreground">{d.char}</div>
        <div className="mt-1.5 flex items-center justify-center gap-1 flex-wrap">
          {d.pinyin && <span className="text-xs italic text-yellow-500">{d.pinyin}</span>}
          {showSino && (
            <>
              {d.pinyin && <span className="text-[9px] text-foreground/30">·</span>}
              <span className="text-xs font-bold text-emerald-500">{d.sinoVietnamese}</span>
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
          {d.pinyin && <span className="text-xs italic text-yellow-500">{d.pinyin}</span>}
          {showSino && (
            <>
              {d.pinyin && <span className="text-[9px] text-foreground/30">·</span>}
              <span className="text-xs font-bold text-emerald-500">{d.sinoVietnamese}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const d = nodeData as CompNodeData
  const showName = d.name && d.name !== d.char
  const charRenderable = (d.char.codePointAt(0) ?? 0) < 0x20000
  const clickable = !!(d.meaning || d.meaningVi)
  return (
    <div
      className={`bg-card/60 border border-border rounded-xl px-3 py-2 text-center min-w-[60px] shadow-sm transition-colors ${clickable ? 'cursor-pointer hover:border-primary/50 hover:bg-card' : ''}`}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      {charRenderable
        ? (
            <>
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
            </>
          )
        : <div className="text-[9px] text-foreground/30 italic leading-tight">{t('breakdown.noGlyph')}</div>}
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
  const { t, locale } = useI18n()
  const [selectedComp, setSelectedComp] = useState<CompNodeData | null>(null)

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

  const meaning = selectedComp
    ? (locale === 'vi' && selectedComp.meaningVi ? selectedComp.meaningVi : selectedComp.meaning)
    : null

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/30 italic mt-1">{t('breakdown.clickHint')}</p>

      <div
        className="w-full rounded-xl overflow-hidden border border-border/30 [&_.react-flow__attribution]:hidden [&_.react-flow__node.selected]:shadow-none [&_.react-flow__node.selected]:outline-none"
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
          elementsSelectable={true}
          onNodeClick={(_, node) => {
            const d = node.data as NodeData
            if (d.kind === 'comp' && (d.meaning || d.meaningVi))
              setSelectedComp(prev => prev?.char === d.char ? null : d as CompNodeData)
          }}
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

      {selectedComp && meaning && (
        <div className="flex items-center gap-3 bg-card border border-border/60 rounded-xl px-4 py-3 text-sm ">
          <span className="text-2xl font-serif font-bold text-foreground leading-none mt-0.5 shrink-0">{selectedComp.char}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedComp.pinyin && <span className="text-xs italic text-yellow-500">{selectedComp.pinyin}</span>}
              {selectedComp.name && (
                <>
                  {selectedComp.pinyin && <span className="text-xs text-foreground/30">·</span>}
                  <span className="text-xs font-bold text-emerald-500">{selectedComp.name}</span>
                </>
              )}
            </div>
            <p className="text-foreground/70 mt-1 leading-snug">{meaning}</p>
          </div>
          <button
            onClick={() => setSelectedComp(null)}
            className="text-foreground/30 hover:text-foreground/60 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
