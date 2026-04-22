import type { LucideIcon } from 'lucide-react'
import type { Persona } from '@/lib/constants'
import { AlertCircle, BookOpen, Coffee, Heart, MapPin, Sparkles, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'

interface ApiPersona {
  id: string
  name: string
  tagline: string
  supported_languages: string[]
}

interface PersonaPickerProps {
  targetLanguage: string
  onSelect: (persona: Persona) => void
}

const PERSONA_ICONS: Record<string, LucideIcon> = {
  friendly_buddy: User,
  anime_crushing: Heart,
  angry_mom: AlertCircle,
  taxi_driver: Sparkles,
  patient_tutor: BookOpen,
  encouraging_friend: Sparkles,
  english_barista: Coffee,
  japanese_senpai: MapPin,
}

export function PersonaPicker({ targetLanguage, onSelect }: PersonaPickerProps) {
  const { t, locale } = useI18n()
  const [personas, setPersonas] = useState<ApiPersona[]>([])

  useEffect(() => {
    fetch(`${API_BASE}/api/speak/personas?target_lang=${encodeURIComponent(targetLanguage)}&interface_lang=${encodeURIComponent(locale)}`)
      .then(r => r.json())
      .then((d: any) => setPersonas(d.personas ?? []))
      .catch(() => {})
  }, [targetLanguage, locale])

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground leading-none">{t('speak.selectPersona')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t('speak.selectPersonaDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {personas.map((p) => {
          const Icon = PERSONA_ICONS[p.id] || User

          return (
            <button
              type="button"
              key={p.id}
              className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative text-left"
              onClick={() => onSelect({
                id: p.id,
                name: p.name,
                tagline: p.tagline,
                supported_languages: p.supported_languages,
              })}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-all border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 overflow-hidden mb-1">
                  <h3 className="font-bold text-foreground truncate">{p.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {p.tagline}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
