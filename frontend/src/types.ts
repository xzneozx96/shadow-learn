export interface WordTiming {
  text: string
  start: number
  end: number
}

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
  wordTimings?: WordTiming[]
}

export interface LessonMeta {
  id: string
  title: string
  source: 'youtube' | 'upload'
  sourceUrl: string | null
  duration?: number         // optional: stub lessons don't have it yet
  segmentCount?: number     // optional: stub lessons don't have it yet
  translationLanguages: string[]
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: string | null
  tags: string[]
  status?: 'processing' | 'complete' | 'error'  // undefined treated as 'complete'
  jobId?: string
  errorMessage?: string
  currentStep?: string
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
  openaiApiKey: string
  minimaxApiKey?: string
  deepgramApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
}

export interface VocabEntry {
  id: string
  word: string
  pinyin: string
  meaning: string
  usage: string
  sourceLessonId: string
  sourceLessonTitle: string
  sourceSegmentId: string
  sourceSegmentChinese: string
  sourceSegmentTranslation: string
  createdAt: string
}
