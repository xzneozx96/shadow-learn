export const SPEAK_LANGUAGES = [
  { code: 'zh-CN', flag: '🇨🇳', label: '中文 (简体)' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
] as const

export type SpeakLanguageCode = (typeof SPEAK_LANGUAGES)[number]['code']

export function isSupportedSpeakLanguage(code: string): code is SpeakLanguageCode {
  return SPEAK_LANGUAGES.some(l => l.code === code)
}
