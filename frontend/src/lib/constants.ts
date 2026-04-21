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

export const SITUATIONS = [
  { id: 'casual_chat', title: 'Casual Chat', level: 'Beginner', description: 'Have a relaxed conversation about your day and interests.' },
  { id: 'ordering_food', title: 'Ordering Food', level: 'Beginner', description: 'Practice your survival skills at a local restaurant.' },
  { id: 'asking_directions', title: 'Asking Directions', level: 'Intermediate', description: 'Navigate through the city by asking for help.' },
  { id: 'shopping', title: 'Shopping', level: 'Intermediate', description: 'Browse items, ask for prices, and find what you need.' },
  { id: 'job_interview', title: 'Job Interview', level: 'Advanced', description: 'Prepare for your career with professional dialogue.' },
  { id: 'meeting_parents', title: 'Meeting Parents', level: 'Advanced', description: 'Make a great first impression in a formal family setting.' },
  { id: 'hospital', title: 'Hospital Visit', level: 'Intermediate', description: 'Describe symptoms and understand medical advice.' },
  { id: 'karaoke', title: 'Karaoke Night', level: 'Beginner', description: 'Relax and socialize after a long day of studying.' },
  { id: 'market_haggling', title: 'Market Haggling', level: 'Intermediate', description: 'Get the best price with your negotiation skills.' },
  { id: 'dating_app', title: 'Dating App', level: 'Advanced', description: 'Break the ice and get to know someone new.' },
] as const

export type Situation = typeof SITUATIONS[number]
