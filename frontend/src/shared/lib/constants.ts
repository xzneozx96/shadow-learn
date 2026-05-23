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

export interface Persona {
  id: string
  name: string
  tagline: string
  portrait_url?: string | null
  voice_ids?: Record<string, string>
  supported_languages: string[]
}

export function getPersonaName(persona: { name: string | PersonaName }, locale: Locale): string {
  if (typeof persona.name === 'string') {
    return persona.name
  }
  return persona.name[locale] ?? persona.name.en
}

export function getPersonaTagline(persona: { tagline: string | PersonaName }, locale: Locale): string {
  if (typeof persona.tagline === 'string') {
    return persona.tagline
  }
  if (typeof persona.tagline === 'object' && 'en' in persona.tagline) {
    return persona.tagline[locale] ?? persona.tagline.en
  }
  return ''
}
