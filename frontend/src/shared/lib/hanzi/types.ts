export interface Component {
  char: string
  /** Mandarin pinyin with tone marks, e.g. "tián" for 田. */
  pinyin: string
  /** Sino-Vietnamese reading (Hán Việt) of the component, e.g. "Điền" for 田. */
  name: string
  /** English semantic gloss, e.g. "field" for 田. */
  meaning: string
  /** Vietnamese semantic gloss ("nghĩa"), e.g. "Ruộng" for 田. */
  meaningVi: string
}

export interface CharData {
  char: string
  pinyin: string
  sinoVietnamese: string | null
  components: Component[]
  meaning: string
}
