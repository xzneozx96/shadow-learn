declare module 'hanzi' {
  interface DecomposeResult {
    character: string
    components?: string[]
    components1?: string[]
  }
  function start(): void
  function decompose(character: string, type: number): DecomposeResult | null
  export { decompose, start }
  export default { start, decompose }
}
