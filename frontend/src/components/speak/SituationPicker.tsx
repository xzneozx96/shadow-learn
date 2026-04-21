import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Briefcase, DollarSign, Heart, Hospital, MapPin, MessageCircle, Mic, ShoppingCart, Sparkles, Users, Utensils } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'

interface ApiSituation {
  id: string
  title: string
  description: string
  icon?: string
}

interface SelectedSituation {
  id: string
  title: string
  userGoal: string
}

interface SituationPickerProps {
  targetLanguage: string
  onSelect: (situation: SelectedSituation) => void
  onRequestCustom: () => void
}

const SITUATION_ICONS: Record<string, LucideIcon> = {
  casual_chat: MessageCircle,
  ordering_food: Utensils,
  asking_directions: MapPin,
  shopping: ShoppingCart,
  job_interview: Briefcase,
  meeting_parents: Users,
  hospital: Hospital,
  karaoke: Mic,
  market_haggling: DollarSign,
  dating_app: Heart,
}

export function SituationPicker({ targetLanguage, onSelect, onRequestCustom }: SituationPickerProps) {
  const { t } = useI18n()
  const [situations, setSituations] = useState<ApiSituation[]>([])

  useEffect(() => {
    fetch(`/api/speak/situations?lang=${encodeURIComponent(targetLanguage)}`)
      .then(r => r.json())
      .then((d: any) => setSituations(d.situations ?? []))
      .catch(() => {})
  }, [targetLanguage])

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">{t('speak.selectSituation')}</h2>
        <p className="text-sm text-muted-foreground">{t('speak.selectSituationDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {/* Create your own card — always first */}
        <button
          type="button"
          onClick={onRequestCustom}
          className="elegant-card p-4 cursor-pointer group flex flex-col items-center justify-center gap-2 h-full border-dashed text-center"
        >
          <span aria-hidden="true" className="text-2xl">✨</span>
          <span className="font-medium text-sm text-foreground">Create your own</span>
          <span className="text-xs text-muted-foreground text-center">
            Describe any scene and we'll set it up
          </span>
        </button>

        {situations.map((s) => {
          const Icon = SITUATION_ICONS[s.id] || MessageCircle

          return (
            <button
              type="button"
              key={s.id}
              className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative text-left"
              onClick={() => onSelect({ id: s.id, title: s.title, userGoal: '' })}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-all border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 overflow-hidden mb-1">
                  <h3 className="font-bold text-sm text-foreground truncate">{s.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {s.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
