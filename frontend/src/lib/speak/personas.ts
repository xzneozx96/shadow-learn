export const PERSONAS = [
  {
    id: 'friendly_buddy',
    name: 'Friendly Buddy',
    tagline: 'A friendly language partner for casual practice',
    level: 'beginner',
    portrait_url: null,
  },
  {
    id: 'anime_crushing',
    name: 'Anime Crush',
    tagline: 'Flirty and fun - but don\'t get distracted!',
    level: 'intermediate',
    portrait_url: null,
  },
  {
    id: 'angry_mom',
    name: 'Angry Mom',
    tagline: 'Why haven\'t you studied?! Let me help you!',
    level: 'intermediate',
    portrait_url: null,
  },
  {
    id: 'taxi_driver',
    name: 'Beijing Taxi Driver',
    tagline: 'Knows the city like the back of his hand',
    level: 'advanced',
    portrait_url: null,
  },
  {
    id: 'kdrama_oppa',
    name: 'K-drama Oppa',
    tagline: 'Charming and always has a joke ready',
    level: 'intermediate',
    portrait_url: null,
  },
] as const

export type Persona = typeof PERSONAS[number]
