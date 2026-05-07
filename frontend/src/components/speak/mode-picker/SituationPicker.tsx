import type { LucideIcon } from 'lucide-react'
import type { SpeakSituation } from '@/types'
import { Briefcase, DollarSign, Heart, Hospital, MapPin, MessageCircle, Mic, ShoppingCart, Users, Utensils } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'

interface ApiSituation {
  id: string
  title: string
  description: string
  icon?: string
}

interface SituationPickerProps {
  targetLanguage: string
  onSelect: (situation: SpeakSituation) => void
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
  const { t, locale } = useI18n()
  const [situations, setSituations] = useState<ApiSituation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/api/speak/situations?target_lang=${encodeURIComponent(targetLanguage)}&interface_lang=${encodeURIComponent(locale)}`)
      .then(r => r.json())
      .then((d: any) => setSituations(d.situations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [targetLanguage, locale])

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">{t('speak.selectSituation')}</h2>
        <p className="text-sm text-muted-foreground">{t('speak.selectSituationDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Create your own card — always first, not skeleton'd */}
        <motion.button
          type="button"
          onClick={onRequestCustom}
          className="elegant-card p-4 cursor-pointer group flex flex-col items-center justify-center gap-2 h-full border text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <span aria-hidden="true" className="text-2xl">✨</span>
          <span className="font-medium text-foreground">{t('speak.createOwn.title')}</span>
          <span className="text-sm text-muted-foreground text-center">
            {t('speak.createOwn.desc')}
          </span>
        </motion.button>

        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="elegant-card p-4 flex flex-col items-start gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted/60 shrink-0" />
                <div className="flex-1 w-full space-y-2">
                  <div className="h-4 bg-muted/60 rounded w-2/3" />
                  <div className="h-3 bg-muted/40 rounded w-full" />
                  <div className="h-3 bg-muted/40 rounded w-4/5" />
                </div>
              </div>
            ))
          : situations.map((s, i) => {
              const Icon = SITUATION_ICONS[s.id] || MessageCircle
              return (
                <motion.button
                  type="button"
                  key={s.id}
                  className="elegant-card p-4 cursor-pointer group flex flex-col items-start gap-4 h-full relative text-left"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onSelect({ id: s.id, title: s.title, userGoal: '' })}
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-all border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 overflow-hidden mb-1">
                      <h3 className="font-bold text-foreground truncate">{s.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                </motion.button>
              )
            })}
      </div>
    </div>
  )
}
