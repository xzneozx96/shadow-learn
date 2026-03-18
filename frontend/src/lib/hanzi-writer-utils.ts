import type HanziWriter from 'hanzi-writer'

// Expose animate method for parent to call (hint button)
export function animateCharacter(writerRef: React.RefObject<HanziWriter | null>, onComplete?: () => void) {
  writerRef.current?.animateCharacter({ onComplete })
}
