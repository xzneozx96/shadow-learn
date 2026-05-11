import type { LucideIcon } from 'lucide-react'
import type { Persona } from '@/lib/constants'
import { AlertCircle, BookOpen, Coffee, Heart, MapPin, Sparkles, User } from 'lucide-react'
import { motion } from 'motion/react'
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
  const [personas, setPersonas] = useState<ApiPersona[] | null>(null)
  const loading = personas === null

  // Reset to loading state when deps change (setState-during-render)
  const [lastLang, setLastLang] = useState(targetLanguage)
  const [lastLocale, setLastLocale] = useState(locale)
  if (lastLang !== targetLanguage || lastLocale !== locale) {
    setLastLang(targetLanguage)
    setLastLocale(locale)
    setPersonas(null)
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/speak/personas?target_lang=${encodeURIComponent(targetLanguage)}&interface_lang=${encodeURIComponent(locale)}`)
      .then(r => r.json())
      .then((d: any) => setPersonas(d.personas ?? []))
      .catch(() => setPersonas([]))
  }, [targetLanguage, locale])

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground leading-none">{t('speak.selectPersona')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t('speak.selectPersonaDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="elegant-card p-4 flex flex-col items-start gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted/60 shrink-0" />
                <div className="flex-1 w-full space-y-2">
                  <div className="h-4 bg-muted/60 rounded w-2/3" />
                  <div className="h-3 bg-muted/40 rounded w-full" />
                  <div className="h-3 bg-muted/40 rounded w-4/5" />
                </div>
              </div>
            ))
          : personas.map((p, i) => {
              const Icon = PERSONA_ICONS[p.id] || User
              return (
                <motion.button
                  type="button"
                  key={p.id}
                  className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative text-left"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
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
                </motion.button>
              )
            })}
      </div>
    </div>
  )
}
