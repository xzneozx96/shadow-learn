declare module 'hanzi' {
  interface DecomposeResult {
    character: string
    components?: string[]
  }
  const hanzi: {
    start: () => void
    decompose: (character: string, type: number) => DecomposeResult | null
  }
  export default hanzi
}
