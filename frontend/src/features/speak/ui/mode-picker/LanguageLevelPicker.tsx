import { motion } from 'motion/react'
import { useI18n } from '@/app/providers/I18nContext'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { SPEAK_LANGUAGES } from '../speak-languages'

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface LanguageLevelPickerProps {
  language: string | null
  level: ProficiencyLevel | null
  onLanguageChange: (language: string) => void
  onLevelChange: (level: ProficiencyLevel) => void
  onContinue: () => void
}

const LEVEL_IDS: Array<{ id: ProficiencyLevel, icon: string }> = [
  { id: 'beginner', icon: '🌱' },
  { id: 'intermediate', icon: '🌿' },
  { id: 'advanced', icon: '🌳' },
]

export function LanguageLevelPicker({
  language,
  level,
  onLanguageChange,
  onLevelChange,
  onContinue,
}: LanguageLevelPickerProps) {
  const { t } = useI18n()
  const canContinue = language !== null && level !== null

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('speak.languagePicker.title')}</h3>
        <div className="grid grid-cols-3 gap-4">
          {SPEAK_LANGUAGES.map((lang, i) => (
            <motion.button
              key={lang.code}
              type="button"
              onClick={() => onLanguageChange(lang.code)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'elegant-card px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer',
                language === lang.code
                  ? 'border-primary ring-1 ring-primary/40 bg-card'
                  : 'hover:bg-secondary/40',
              )}
              aria-pressed={language === lang.code}
            >
              <span className="text-2xl" aria-hidden="true">{lang.flag}</span>
              <span className="text-sm font-medium text-foreground">{lang.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('speak.levelPicker.title')}</h3>
        <div className="flex gap-4">
          {LEVEL_IDS.map((lvl, i) => (
            <motion.button
              key={lvl.id}
              type="button"
              onClick={() => onLevelChange(lvl.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.15 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'elegant-card px-3 py-2.5 w-full flex flex-col gap-3 text-left transition-colors cursor-pointer',
                level === lvl.id
                  ? 'border-primary ring-1 ring-primary/40 bg-card'
                  : 'hover:bg-secondary/40',
              )}
              aria-pressed={level === lvl.id}
            >
              <span className="text-xl" aria-hidden="true">{lvl.icon}</span>
              <div className="mt-2">
                <div className="font-medium text-foreground">{t(`speak.level.${lvl.id}.title`)}</div>
                <div className="text-sm text-muted-foreground mt-1">{t(`speak.level.${lvl.id}.subtitle`)}</div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <Button
        size="lg"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full"
      >
        {t('speak.continue')}
      </Button>
    </div>
  )
}
