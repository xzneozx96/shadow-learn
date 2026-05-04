export interface Component {
  char: string
  name: string
  meaning: string
}

export interface CharData {
  char: string
  pinyin: string
  sinoVietnamese: string | null
  components: Component[]
  meaning: string
}
