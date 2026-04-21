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

export const PERSONAS = [
  {
    id: 'friendly_buddy',
    name: 'Friendly Buddy',
    tagline: 'A friendly language partner for casual practice',
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
    name: 'Anime Crush',
    tagline: "Flirty and fun — but don't get distracted!",
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
    name: 'Strict Parent',
    tagline: "Why haven't you studied?! Let me help you!",
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
    name: 'Beijing Taxi Driver',
    tagline: 'Knows the city like the back of his hand',
    portrait_url: null as string | null,
    voice_ids: { 'zh-CN': 'Fenrir' },
    supported_languages: ['zh-CN'],
  },
] as const

export type Persona = typeof PERSONAS[number]
