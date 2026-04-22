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
    name: { en: 'Cozy Bestie', vi: 'Cạ Cứng' },
    tagline: { en: 'Always ready for a lovely little chat! ✨', vi: 'Vui vẻ không quạo! ✨' },
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
    name: { en: 'Anime Sweetie', vi: 'Người Thương' },
    tagline: { en: 'Study hard for me, okay? I\'ll be watching... 🌸', vi: 'Học giỏi đi rồi em thưởng cho nha... 🌸' },
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
    name: { en: 'Angry Mom', vi: 'Phụ huynh mẫu mực' },
    tagline: { en: 'No studying, no snacks! Focus! 🥖', vi: 'Học hay là ăn gậy? 🥖' },
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
    name: { en: 'Tech Rider', vi: 'Anh Grab' },
    tagline: { en: 'Rain or shine, the road is clear, Your friendly rider is always here! 🛵', vi: 'Nắng mưa là chuyện của trời, Đưa bạn đi học là đời anh vui! 🛵' },
    portrait_url: null as string | null,
    voice_ids: { 'zh-CN': 'Fenrir' },
    supported_languages: ['zh-CN'],
  },
] as const

export type Persona = typeof PERSONAS[number]
