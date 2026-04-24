import type { AgentState } from '@livekit/components-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

function generateConnectingSequenceBar(columns: number): number[][] {
  const seq = []

  for (let x = 0; x < columns; x++) {
    seq.push([x, columns - 1 - x])
  }

  return seq
}

function generateListeningSequenceBar(columns: number): number[][] {
  const center = Math.floor(columns / 2)
  const noIndex = -1

  return [[center], [noIndex]]
}

function computeSequence(state: AgentState | undefined, columns: number): number[][] {
  if (state === 'thinking')
    return generateListeningSequenceBar(columns)
  if (state === 'connecting' || state === 'initializing')
    return [...generateConnectingSequenceBar(columns)]
  if (state === 'listening')
    return generateListeningSequenceBar(columns)
  if (state === undefined || state === 'speaking')
    return [Array.from({ length: columns }, (_, idx) => idx)]
  return [[]]
}

type IndexAction = { type: 'tick' } | { type: 'reset' }

function indexReducer(state: number, action: IndexAction): number {
  switch (action.type) {
    case 'tick':
      return state + 1
    case 'reset':
      return 0
  }
}

export function useAgentAudioVisualizerBarAnimator(
  state: AgentState | undefined,
  columns: number,
  interval: number,
): number[] {
  // Sequence derived from state + columns — React guide: "transforming data for rendering"
  const sequence = useMemo(() => computeSequence(state, columns), [state, columns])

  // Index tick driven by rAF — useReducer dispatch avoids the setState-in-effect lint rule
  // and still triggers re-renders on each tick.
  const [index, dispatchIndex] = useReducer(indexReducer, 0)

  // Reset index when inputs change — React guide: "adjusting state when a prop changes"
  // via a prev-value guard during render (not inside useEffect).
  const [prevKey, setPrevKey] = useState(`${state}|${columns}`)
  const currentKey = `${state}|${columns}`
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    dispatchIndex({ type: 'reset' })
  }

  const animationFrameIdRef = useRef<number | null>(null)
  useEffect(() => {
    let startTime = performance.now()

    const animate = (time: DOMHighResTimeStamp) => {
      const timeElapsed = time - startTime

      if (timeElapsed >= interval) {
        dispatchIndex({ type: 'tick' })
        startTime = time
      }

      animationFrameIdRef.current = requestAnimationFrame(animate)
    }

    animationFrameIdRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [interval, columns, state, sequence.length])

  return sequence[index % sequence.length] ?? []
}
