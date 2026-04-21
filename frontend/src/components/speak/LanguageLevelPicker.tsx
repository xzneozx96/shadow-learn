import { cn } from '@/lib/utils'

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface LanguageLevelPickerProps {
  language: string | null
  level: ProficiencyLevel | null
  onLanguageChange: (language: string) => void
  onLevelChange: (level: ProficiencyLevel) => void
  onContinue: () => void
}

const SPEAK_LANGUAGES = [
  { code: 'zh-CN', flag: '🇨🇳', label: '中文 (简体)' },
  { code: 'zh-TW', flag: '🇹🇼', label: '中文 (繁體)' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
]

const LEVELS: Array<{ id: ProficiencyLevel, title: string, subtitle: string, icon: string }> = [
  { id: 'beginner', title: 'Still learning', subtitle: 'Basics. Short sentences. Slow pace.', icon: '🌱' },
  { id: 'intermediate', title: 'Getting there', subtitle: 'Everyday topics. Natural pace with support.', icon: '🌿' },
  { id: 'advanced', title: 'Pretty confident', subtitle: 'Natural pace. Idioms. No hand-holding.', icon: '🌳' },
]

export function LanguageLevelPicker({
  language,
  level,
  onLanguageChange,
  onLevelChange,
  onContinue,
}: LanguageLevelPickerProps) {
  const canContinue = language !== null && level !== null

  return (
    <div className="space-y-6">
      {/* Language section */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">Which language do you want to practice?</h3>
        <div className="grid grid-cols-2 gap-2">
          {SPEAK_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              type="button"
              onClick={() => onLanguageChange(lang.code)}
              className={cn(
                'elegant-card px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer',
                language === lang.code
                  ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
              aria-pressed={language === lang.code}
            >
              <span className="text-2xl" aria-hidden="true">{lang.flag}</span>
              <span className="text-sm font-medium text-foreground">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Level section */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">How does your language feel today?</h3>
        <div className="space-y-1.5">
          {LEVELS.map(lvl => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => onLevelChange(lvl.id)}
              className={cn(
                'elegant-card px-3 py-2.5 w-full flex items-center gap-3 text-left transition-colors cursor-pointer',
                level === lvl.id
                  ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
                  : 'hover:bg-muted/50',
              )}
              aria-pressed={level === lvl.id}
            >
              <span className="text-xl" aria-hidden="true">{lvl.icon}</span>
              <div>
                <div className="text-sm font-medium text-foreground">{lvl.title}</div>
                <div className="text-xs text-muted-foreground">{lvl.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full py-2.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
      >
        Continue
      </button>
    </div>
  )
}
