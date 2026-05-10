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
  azureSpeechKey?: string
  azureSpeechRegion?: string
  googleRealtimeKey?: string
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

export interface WordBreakdown {
  word: string
  sourceLanguage: string
  characters: import('./lib/hanzi/types').CharData[]
  story: string | null
  storyLanguage: string
  generatedAt: string | null
}

// Speak feature types

export interface GrammarFeedback {
  type: 'grammar'
  transcript: string
  issues: Array<{
    original: string
    correction: string
    explanation: string
  }>
}

export interface NextLineSuggestion {
  type: 'next-line'
  suggestion: string
  romanization: string
  translation: string
}

export interface CulturalTip {
  type: 'cultural-tip'
  phrase: string
  explanation: string
}

export interface AiTurnTranslation {
  type: 'ai-turn-translation'
  transcript: string
  translation: string
  romanization: string
}

export interface VocabTip {
  type: 'vocab-tip'
  word: string
  reason: string
}

export interface SessionEvaluation {
  type: 'session-evaluation'
  strengths: string[]
  areas_to_improve: string[]
  vocabulary_mastered: string[]
  vocabulary_to_practice: string[]
  suggestions: string[]
}

export interface VocabItem {
  term: string
  pinyin?: string
  meaning?: string
}

export interface SpeakSituation {
  id: string
  title: string
  userGoal: string
  target_vocab?: VocabItem[]
}

// Collection types

export interface CollectionVideo {
  video_id: string
  title: string
  duration: string
  difficulty: string | null
}

export interface CollectionPlaylist {
  name: string
  icon: string
  playlist_id: string
  videos: CollectionVideo[]
}

export type CollectionResponse = CollectionPlaylist[]
