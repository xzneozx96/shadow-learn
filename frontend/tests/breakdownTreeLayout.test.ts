import type { CharData } from '@/lib/hanzi/types'
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  CHAR_GAP,
  LEAF_GAP,
  NODE_H,
  NODE_W_CHAR,
  NODE_W_COMP,
  NODE_W_WORD,
  ROW_GAP,
} from '@/components/workbook/breakdownTreeLayout'

function makeChar(char: string, comps: string[] = []): CharData {
  return {
    char,
    pinyin: `py-${char}`,
    sinoVietnamese: `sv-${char}`,
    meaning: '',
    components: comps.map(c => ({ char: c, pinyin: `py-${c}`, name: `nm-${c}`, meaning: '', meaningVi: '' })),
  }
}

describe('buildGraph', () => {
  it('returns empty graph for zero characters', () => {
    const result = buildGraph('x', 'x', null, [])
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })

  describe('single character', () => {
    it('char is root at y=0 with no word node', () => {
      const result = buildGraph('学', 'xué', 'HỌC', [makeChar('学', ['⺍', '子'])])
      const charNode = result.nodes.find(n => n.id === 'char-0')
      expect(charNode).toBeDefined()
      expect(charNode?.position.y).toBe(0)
      expect(result.nodes.find(n => n.id === 'word')).toBeUndefined()
    })

    it('comp nodes appear at y=ROW_GAP', () => {
      const result = buildGraph('学', 'xué', null, [makeChar('学', ['⺍', '子'])])
      const comp0 = result.nodes.find(n => n.id === 'comp-0-0')
      const comp1 = result.nodes.find(n => n.id === 'comp-0-1')
      expect(comp0?.position.y).toBe(ROW_GAP)
      expect(comp1?.position.y).toBe(ROW_GAP)
    })

    it('comp nodes are spaced horizontally by NODE_W_COMP + LEAF_GAP', () => {
      const result = buildGraph('学', 'xué', null, [makeChar('学', ['⺍', '子'])])
      const comp0 = result.nodes.find(n => n.id === 'comp-0-0')!
      const comp1 = result.nodes.find(n => n.id === 'comp-0-1')!
      expect(comp1.position.x - comp0.position.x).toBe(NODE_W_COMP + LEAF_GAP)
    })

    it('char node is horizontally centered over components', () => {
      const result = buildGraph('学', 'xué', null, [makeChar('学', ['⺍', '子'])])
      const charNode = result.nodes.find(n => n.id === 'char-0')!
      const comp0 = result.nodes.find(n => n.id === 'comp-0-0')!
      const comp1 = result.nodes.find(n => n.id === 'comp-0-1')!
      const compCenter = (comp0.position.x + comp1.position.x) / 2
      const charCenter = charNode.position.x + NODE_W_CHAR / 2
      expect(charCenter).toBeCloseTo(compCenter + NODE_W_COMP / 2, 0)
    })

    it('edges connect char to each comp', () => {
      const result = buildGraph('学', 'xué', null, [makeChar('学', ['⺍', '子'])])
      expect(result.edges).toHaveLength(2)
      expect(result.edges.every(e => e.source === 'char-0')).toBe(true)
    })

    it('height is ROW_GAP + NODE_H when comps exist', () => {
      const result = buildGraph('学', 'xué', null, [makeChar('学', ['⺍', '子'])])
      expect(result.height).toBe(ROW_GAP + NODE_H)
    })

    it('height is NODE_H when char has no comps', () => {
      const result = buildGraph('一', 'yī', null, [makeChar('一')])
      expect(result.height).toBe(NODE_H)
    })
  })

  describe('multi character', () => {
    it('word node exists at y=0', () => {
      const result = buildGraph('需要', 'xūyào', 'NHU YẾU', [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      const wordNode = result.nodes.find(n => n.id === 'word')
      expect(wordNode).toBeDefined()
      expect(wordNode?.position.y).toBe(0)
    })

    it('char nodes appear at y=ROW_GAP', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      expect(result.nodes.find(n => n.id === 'char-0')?.position.y).toBe(ROW_GAP)
      expect(result.nodes.find(n => n.id === 'char-1')?.position.y).toBe(ROW_GAP)
    })

    it('comp nodes appear at y=ROW_GAP*2', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      const compNodes = result.nodes.filter(n => n.id.startsWith('comp-'))
      expect(compNodes.every(n => n.position.y === ROW_GAP * 2)).toBe(true)
    })

    it('word node is horizontally centered over chars', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      const wordNode = result.nodes.find(n => n.id === 'word')!
      const char0 = result.nodes.find(n => n.id === 'char-0')!
      const char1 = result.nodes.find(n => n.id === 'char-1')!
      const charMidpoint = (char0.position.x + NODE_W_CHAR / 2 + char1.position.x + NODE_W_CHAR / 2) / 2
      const wordCenter = wordNode.position.x + NODE_W_WORD / 2
      expect(wordCenter).toBeCloseTo(charMidpoint, 0)
    })

    it('two chars separated by CHAR_GAP between clusters', () => {
      const result = buildGraph('AB', 'ab', null, [
        makeChar('A', ['x']),
        makeChar('B', ['y']),
      ])
      expect(result.width).toBe(NODE_W_COMP + CHAR_GAP + NODE_W_COMP)
    })

    it('word→char edges exist for every char', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      expect(result.edges.find(e => e.source === 'word' && e.target === 'char-0')).toBeDefined()
      expect(result.edges.find(e => e.source === 'word' && e.target === 'char-1')).toBeDefined()
    })

    it('char→comp edges exist for every component', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      const charCompEdges = result.edges.filter(e => e.source.startsWith('char-'))
      expect(charCompEdges).toHaveLength(4)
    })

    it('char with no comps renders as leaf with no outgoing edges', () => {
      const result = buildGraph('AB', 'ab', null, [
        makeChar('A'),
        makeChar('B', ['x']),
      ])
      const edgesFromChar0 = result.edges.filter(e => e.source === 'char-0')
      expect(edgesFromChar0).toHaveLength(0)
    })

    it('all edges use default bezier type', () => {
      const result = buildGraph('需要', 'xūyào', null, [
        makeChar('需', ['雨', '而']),
        makeChar('要', ['覀', '女']),
      ])
      result.edges.forEach((e) => {
        expect(e.type).toBe('default')
      })
    })
  })
})
