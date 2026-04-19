import type { Persona } from '@/lib/constants'
import { AlertCircle, Heart, Sparkles, User } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { PERSONAS } from '@/lib/constants'
import { getLevelColor } from '@/lib/utils'

interface PersonaPickerProps {
  onSelect: (persona: Persona) => void
}

const PERSONA_ICONS: Record<string, any> = {
  friendly_buddy: User,
  anime_crushing: Heart,
  angry_mom: AlertCircle,
  taxi_driver: Sparkles,
}

export function PersonaPicker({ onSelect }: PersonaPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground leading-none">{t('speak.selectPersona')}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t('speak.selectPersonaDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {PERSONAS.map((p) => {
          const Icon = PERSONA_ICONS[p.id] || User

          return (
            <div
              key={p.id}
              className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative"
              onClick={() => onSelect(p)}
            >
              {/* Level Badge - Top Right */}
              <span className={`absolute top-3 right-3 text-xs uppercase font-bold tracking-wider py-0.5 px-2 rounded-full border z-10 ${getLevelColor(p.level)}`}>
                {p.level}
              </span>

              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-all border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent">
                {p.portrait_url
                  ? <img src={p.portrait_url} alt={p.name} className="w-full h-full object-cover rounded-full" />
                  : <Icon className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 overflow-hidden mb-1">
                  <h3 className="font-bold text-sm text-foreground truncate pr-16">{p.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {p.tagline}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
