import HanziWriter from 'hanzi-writer'
import { useEffect, useRef } from 'react'

interface Props {
  character: string
  writerRef?: React.RefObject<HanziWriter | null>
  onComplete: (usedHint: boolean) => void
  showOutline?: boolean
}

export function HanziWriterCanvas({ character, writerRef, onComplete, showOutline = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalWriterRef = useRef<HanziWriter | null>(null)
  const hintUsedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    const writer = HanziWriter.create(container, character, {
      width: 200,
      height: 200,
      padding: 10,
      showOutline,
      strokeColor: '#ffffff',
      outlineColor: '#3f3f46',
      drawingColor: '#60a5fa',
      drawingWidth: 4,
    })

    internalWriterRef.current = writer
    if (writerRef)
      writerRef.current = writer
    hintUsedRef.current = false

    writer.quiz({
      onComplete: () => {
        onComplete(hintUsedRef.current)
      },
      leniency: 1,
      // After 3 missed strokes, hanzi-writer animates the hint automatically.
      showHintAfterMisses: 3,
      onMistake: (strokeData) => {
        if ((strokeData as any).mistakesOnStroke >= 3) {
          hintUsedRef.current = true
        }
      },
    })

    return () => {
      writer.cancelQuiz()
      if (container)
        container.innerHTML = ''
      internalWriterRef.current = null
      if (writerRef)
        writerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]) // re-mount when character changes; writerRef and onComplete are stable refs/callbacks;
  // showOutline is safe to omit because CharacterWritingExercise always changes the key when stage changes,
  // forcing a remount — so the effect always captures the current showOutline value

  return (
    <div className="relative">
      {/* Grid background: outer border + cross dividers */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #3f3f46 1px, transparent 1px),
            linear-gradient(to bottom, #3f3f46 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
          backgroundPosition: '99px 99px',
          border: '1px solid #3f3f46',
        }}
      />
      <div ref={containerRef} style={{ width: 200, height: 200 }} />
    </div>
  )
}
