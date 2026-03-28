export interface WordTiming {
  text: string
  start: number
  end: number
}

export interface Word {
  word: string
  romanization: string
  meaning: string
  usage: string
}

export interface Segment {
  id: string
  start: number
  end: number
  text: string
  romanization: string
  translations: Record<string, string>
  words: Word[]
  wordTimings?: WordTiming[]
}

export interface LessonMeta {
  id: string
  title: string
  source: 'youtube' | 'upload'
  sourceUrl: string | null
  duration?: number // optional: stub lessons don't have it yet
  segmentCount?: number // optional: stub lessons don't have it yet
  translationLanguages: string[]
  sourceLanguage?: string
  createdAt: string
  lastOpenedAt: string
  progressSegmentId: string | null
  tags: string[]
  status?: 'processing' | 'complete' | 'error' // undefined treated as 'complete'
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
  uiLanguage?: 'en' | 'vi'
}

export interface DecryptedKeys {
  openrouterApiKey?: string
  minimaxApiKey?: string
  deepgramApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
}

// Azure Pronunciation Assessment types

export type PronunciationErrorType = 'Mispronunciation' | 'Omission' | 'Insertion'

export interface PronunciationWordScore {
  word: string
  accuracy: number
  error_type: PronunciationErrorType | null
  error_detail: string | null
}

export interface PronunciationOverallScore {
  accuracy: number
  fluency: number
  completeness: number
  prosody: number
}

export interface PronunciationAssessResult {
  overall: PronunciationOverallScore
  words: PronunciationWordScore[]
}

export interface VocabEntry {
  id: string
  word: string
  romanization: string
  meaning: string
  usage: string
  sourceLessonId: string
  sourceLessonTitle: string
  sourceSegmentId: string
  sourceSegmentText: string
  sourceSegmentTranslation: string
  sourceLanguage: string
  createdAt: string
}
