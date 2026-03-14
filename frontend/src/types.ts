export interface Word {
  word: string
  pinyin: string
  meaning: string
  usage: string
}

export interface Segment {
  id: string
  start: number
  end: number
  chinese: string
  pinyin: string
  translations: Record<string, string>
  words: Word[]
}

export interface LessonMeta {
  id: string
  title: string
  source: 'youtube' | 'upload'
  sourceUrl: string | null
  duration: number
  segmentCount: number
  translationLanguages: string[]
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: string | null
  tags: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AppSettings {
  translationLanguage: string
  defaultModel: string
}

export interface DecryptedKeys {
  elevenlabsApiKey: string
  openrouterApiKey: string
}
