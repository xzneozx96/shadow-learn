import type { Edge, Node } from '@xyflow/react'
import type { CharData, Component } from '@/lib/hanzi/types'

// ─── Layout constants ─────────────────────────────────────────────────────────

export const NODE_W_WORD = 120
export const NODE_W_CHAR = 96
export const NODE_W_COMP = 80
export const NODE_H = 70
export const ROW_GAP = 100
export const LEAF_GAP = 12
export const CHAR_GAP = 28

// ─── Node data types ──────────────────────────────────────────────────────────

export interface WordNodeData {
  kind: 'word'
  char: string
  pinyin: string
  sinoVietnamese: string | null
  [key: string]: unknown
}

export interface CharNodeData {
  kind: 'char'
  char: string
  pinyin: string
  sinoVietnamese: string | null
  [key: string]: unknown
}

export interface CompNodeData {
  kind: 'comp'
  char: string
  pinyin: string
  name: string
  [key: string]: unknown
}

export type NodeData = WordNodeData | CharNodeData | CompNodeData

// ─── Layout builder ───────────────────────────────────────────────────────────

export function buildGraph(
  word: string,
  pinyin: string,
  sinoVietnamese: string | null,
  characters: CharData[],
): { nodes: Node<NodeData>[], edges: Edge[], width: number, height: number } {
  if (characters.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 }
  }

  const nodes: Node<NodeData>[] = []
  const edges: Edge[] = []
  const isSingle = characters.length === 1

  const edgeStyle = { stroke: 'hsl(var(--border))', strokeWidth: 1.5 }
  const edgeType = 'default' // bezier — no horizontal segments unlike smoothstep

  if (isSingle) {
    const c = characters[0]
    const comps = c.components

    const totalCompWidth = comps.length > 0
      ? comps.length * NODE_W_COMP + (comps.length - 1) * LEAF_GAP
      : NODE_W_CHAR

    const charX = totalCompWidth / 2 - NODE_W_CHAR / 2

    nodes.push({
      id: 'char-0',
      type: 'breakdownNode',
      position: { x: charX, y: 0 },
      data: { kind: 'char', char: c.char, pinyin: c.pinyin, sinoVietnamese: c.sinoVietnamese } as CharNodeData,
    })

    comps.forEach((comp: Component, ci: number) => {
      const compId = `comp-0-${ci}`
      nodes.push({
        id: compId,
        type: 'breakdownNode',
        position: { x: ci * (NODE_W_COMP + LEAF_GAP), y: ROW_GAP },
        data: { kind: 'comp', char: comp.char, pinyin: comp.pinyin, name: comp.name } as CompNodeData,
      })
      edges.push({
        id: `e-char-0-${compId}`,
        source: 'char-0',
        target: compId,
        type: edgeType,
        style: edgeStyle,
      })
    })

    return {
      nodes,
      edges,
      width: Math.max(totalCompWidth, NODE_W_CHAR),
      height: comps.length > 0 ? ROW_GAP + NODE_H : NODE_H,
    }
  }

  // Multi-char: word root → chars → comps
  interface CharLayout { charX: number, compLayouts: Array<{ compX: number, compId: string }> }
  const charLayouts: CharLayout[] = []
  let cursor = 0

  for (let ci = 0; ci < characters.length; ci++) {
    const c = characters[ci]
    const comps = c.components

    if (comps.length === 0) {
      charLayouts.push({ charX: cursor, compLayouts: [] })
      cursor += NODE_W_CHAR
    }
    else {
      const clusterWidth = comps.length * NODE_W_COMP + (comps.length - 1) * LEAF_GAP
      const compLayouts = comps.map((_, i) => ({
        compX: cursor + i * (NODE_W_COMP + LEAF_GAP),
        compId: `comp-${ci}-${i}`,
      }))
      charLayouts.push({ charX: cursor + clusterWidth / 2 - NODE_W_CHAR / 2, compLayouts })
      cursor += clusterWidth
    }

    if (ci < characters.length - 1)
      cursor += CHAR_GAP
  }

  const firstCharCenter = charLayouts[0].charX + NODE_W_CHAR / 2
  const lastCharCenter = charLayouts.at(-1)!.charX + NODE_W_CHAR / 2
  const wordX = (firstCharCenter + lastCharCenter) / 2 - NODE_W_WORD / 2

  nodes.push({
    id: 'word',
    type: 'breakdownNode',
    position: { x: wordX, y: 0 },
    data: { kind: 'word', char: word, pinyin, sinoVietnamese } as WordNodeData,
  })

  for (let ci = 0; ci < characters.length; ci++) {
    const c = characters[ci]
    const { charX, compLayouts } = charLayouts[ci]
    const charId = `char-${ci}`

    nodes.push({
      id: charId,
      type: 'breakdownNode',
      position: { x: charX, y: ROW_GAP },
      data: { kind: 'char', char: c.char, pinyin: c.pinyin, sinoVietnamese: c.sinoVietnamese } as CharNodeData,
    })

    edges.push({
      id: `e-word-${charId}`,
      source: 'word',
      target: charId,
      type: edgeType,
      style: edgeStyle,
    })

    for (let j = 0; j < c.components.length; j++) {
      const comp = c.components[j]
      const { compX, compId } = compLayouts[j]

      nodes.push({
        id: compId,
        type: 'breakdownNode',
        position: { x: compX, y: ROW_GAP * 2 },
        data: { kind: 'comp', char: comp.char, pinyin: comp.pinyin, name: comp.name } as CompNodeData,
      })

      edges.push({
        id: `e-${charId}-${compId}`,
        source: charId,
        target: compId,
        type: edgeType,
        style: edgeStyle,
      })
    }
  }

  const levels = characters.some(c => c.components.length > 0) ? 3 : 2

  return {
    nodes,
    edges,
    width: cursor,
    height: (levels - 1) * ROW_GAP + NODE_H,
  }
}
