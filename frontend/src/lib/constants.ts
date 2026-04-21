import type { Locale } from './i18n'

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'zh-CN', label: '中文' },
]

export const INTERFACE_LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
] as const

export interface PersonaName { en: string, vi: string }

export function getPersonaName(persona: { name: PersonaName | string }, locale: Locale): string {
  if (typeof persona.name === 'string') {
    return persona.name
  }
  return persona.name[locale] ?? persona.name.en
}

export function getPersonaTagline(persona: { tagline: PersonaName | string }, locale: Locale): string {
  if (typeof persona.tagline === 'string') {
    return persona.tagline
  }
  return persona.tagline[locale] ?? persona.tagline.en
}

export const PERSONAS = [
  {
    id: 'friendly_buddy',
    name: { en: 'Friendly Buddy', vi: 'Người bạn thân thiện' },
    tagline: { en: 'A friendly language partner for casual practice', vi: 'Trò chuyện tự nhiên, thoải mái' },
    portrait_url: null as string | null,
    voice_ids: {
      'zh-CN': 'Puck',
      'zh-TW': 'Puck',
      'en': 'Puck',
      'ja': 'Puck',
      'ko': 'Puck',
      'vi': 'Puck',
    },
    supported_languages: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'vi'],
  },
  {
    id: 'anime_crushing',
    name: { en: 'Anime Crush', vi: 'Bồ nhí' },
    tagline: { en: 'Flirty and fun — but don\'t get distracted!', vi: 'Soái ca của em - đừng bị phân tâm nhé!' },
    portrait_url: null as string | null,
    voice_ids: {
      'zh-CN': 'Zephyr',
      'zh-TW': 'Zephyr',
      'en': 'Zephyr',
      'ja': 'Zephyr',
      'ko': 'Zephyr',
    },
    supported_languages: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'],
  },
  {
    id: 'strict_parent',
    name: { en: 'Strict Parent', vi: 'Phụ huynh nghiêm khắc' },
    tagline: { en: 'Why haven\'t you studied?! Let me help you!', vi: 'Sao chưa học bài? Ăn đòn bây giờ!' },
    portrait_url: null as string | null,
    voice_ids: {
      'zh-CN': 'Gacrux',
      'zh-TW': 'Gacrux',
      'en': 'Gacrux',
      'ja': 'Gacrux',
      'ko': 'Gacrux',
      'vi': 'Gacrux',
    },
    supported_languages: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'vi'],
  },
  {
    id: 'taxi_driver',
    name: { en: 'Beijing Taxi Driver', vi: 'Tài xế taxi Bắc Kinh' },
    tagline: { en: 'Knows the city like the back of his hand', vi: 'Am hiểu thành phố như lòng bàn tay' },
    portrait_url: null as string | null,
    voice_ids: { 'zh-CN': 'Fenrir' },
    supported_languages: ['zh-CN'],
  },
] as const

export type Persona = typeof PERSONAS[number]
