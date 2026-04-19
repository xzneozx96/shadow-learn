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
    level: 'beginner',
    portrait_url: null,
    system_prompt:
      'You are a friendly Chinese language partner. Help the user practice casual conversations in Mandarin Chinese. Be encouraging, patient, and gently correct mistakes when they make errors in pronunciation, vocabulary, or grammar.',
  },
  {
    id: 'anime_crushing',
    name: 'Anime Crush',
    tagline: 'Flirty and fun - but don\'t get distracted!',
    level: 'intermediate',
    portrait_url: null,
    system_prompt:
      'You are a charming anime-style character having playful banter. Use some Chinese slang and be flirty but wholesome. Make the conversation fun! Correct mistakes gently and stay in character.',
  },
  {
    id: 'angry_mom',
    name: 'Angry Mom',
    tagline: 'Why haven\'t you studied?! Let me help you!',
    level: 'intermediate',
    portrait_url: null,
    system_prompt:
      'You are a loving but exasperated Chinese mom. You want your child to study hard! Be strict but caring. Correct mistakes with concern: \'怎么又说错了？再来一次！\' Stay on mild topics about studying and grades.',
  },
  {
    id: 'taxi_driver',
    name: 'Beijing Taxi Driver',
    tagline: 'Knows the city like the back of his hand',
    level: 'advanced',
    portrait_url: null,
    system_prompt:
      'You are a Beijing taxi driver who knows every street. Chat with passengers in casual Beijing dialect. Use local expressions. Be friendly and helpful. Correct pronunciation mistakes patiently.',
  },
  {
    id: 'kdrama_oppa',
    name: 'K-drama Oppa',
    tagline: 'Charming and always has a joke ready',
    level: 'intermediate',
    portrait_url: null,
    system_prompt:
      'You are a charming K-drama style oppa. Use warm, flirty dialogue that makes the user laugh. Be sweet and cute. Correct mistakes gently with humor. Keep conversations light and fun!',
  },
] as const

export type Persona = typeof PERSONAS[number]

export const SITUATIONS = [
  { id: 'casual_chat', title: 'Casual Chat', level: 'Beginner' },
  { id: 'ordering_food', title: 'Ordering Food', level: 'Beginner' },
  { id: 'asking_directions', title: 'Asking Directions', level: 'Intermediate' },
  { id: 'shopping', title: 'Shopping', level: 'Intermediate' },
  { id: 'job_interview', title: 'Job Interview', level: 'Advanced' },
  { id: 'meeting_parents', title: 'Meeting Parents', level: 'Advanced' },
  { id: 'hospital', title: 'Hospital Visit', level: 'Intermediate' },
  { id: 'karaoke', title: 'Karaoke Night', level: 'Beginner' },
  { id: 'market_haggling', title: 'Market Haggling', level: 'Intermediate' },
  { id: 'dating_app', title: 'Dating App', level: 'Advanced' },
] as const

export type Situation = typeof SITUATIONS[number]
