import type { ProficiencyLevel } from './mode-picker/LanguageLevelPicker'

export const SPEAK_LANGUAGES = [
  { code: 'zh-CN', flag: '🇨🇳', label: '中文 (简体)' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
] as const

export type SpeakLanguageCode = (typeof SPEAK_LANGUAGES)[number]['code']

export function isSupportedSpeakLanguage(code: string): code is SpeakLanguageCode {
  return SPEAK_LANGUAGES.some(l => l.code === code)
}

export const PROFICIENCY_LABELS: Record<string, Record<ProficiencyLevel, string>> = {
  'zh-CN': { beginner: 'HSK 1-2', intermediate: 'HSK 3-4', advanced: 'HSK 5-6' },
  'zh-TW': { beginner: 'TOCFL A1-A2', intermediate: 'TOCFL B1-B2', advanced: 'TOCFL C1-C2' },
  'ja': { beginner: 'JLPT N5-N4', intermediate: 'JLPT N3-N2', advanced: 'JLPT N1' },
  'ko': { beginner: 'TOPIK I', intermediate: 'TOPIK II 3-4', advanced: 'TOPIK II 5-6' },
  'en': { beginner: 'CEFR A1-A2', intermediate: 'CEFR B1-B2', advanced: 'CEFR C1-C2' },
  'vi': { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
}

export function getLevelLabel(language: string, level: ProficiencyLevel): string {
  return PROFICIENCY_LABELS[language]?.[level] ?? level
}
