import { Briefcase, DollarSign, Heart, Hospital, MapPin, MessageCircle, Mic, ShoppingCart, Users, Utensils } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { SITUATIONS } from '@/lib/constants'
import { getLevelColor } from '@/lib/utils'

interface SituationPickerProps {
  onSelect: (situationId: string) => void
}

const SITUATION_ICONS: Record<string, any> = {
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

export function SituationPicker({ onSelect }: SituationPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">{t('speak.selectSituation')}</h2>
        <p className="text-sm text-muted-foreground">{t('speak.selectSituationDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {SITUATIONS.map((s) => {
          const Icon = SITUATION_ICONS[s.id] || MessageCircle

          return (
            <div
              key={s.id}
              className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative"
              onClick={() => onSelect(s.id)}
            >
              {/* Level Badge - Top Right */}
              <span className={`absolute top-3 right-3 text-xs uppercase font-bold tracking-wider py-0.5 px-2 rounded-full border z-10 ${getLevelColor(s.level)}`}>
                {s.level}
              </span>

              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-all border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 overflow-hidden mb-1">
                  <h3 className="font-bold text-sm text-foreground truncate pr-16">{s.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {s.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
