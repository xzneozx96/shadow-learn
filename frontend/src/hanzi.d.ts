declare module 'hanzi' {
  interface DecomposeResult {
    character: string
    components1: string[]
    components2: string[]
    components3: string[]
  }

  interface DefinitionEntry {
    traditional: string
    simplified: string
    pinyin: string
    definition: string
  }

  const hanzi: {
    start: () => void
    decompose: (character: string, type?: number) => DecomposeResult | 'Invalid Input'
    definitionLookup: (character: string, scriptType?: 's' | 't') => DefinitionEntry[] | null
    getPinyin: (character: string) => string[] | null
    dictionarySearch: (search: string, type?: 'only') => DefinitionEntry[] | null
    getCharacterFrequency: (character: string) => unknown
  }
  export default hanzi
}
