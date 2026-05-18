import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n'
import { Lock } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  Icon: LucideIcon
  labelKey: TranslationKey
  reasonKey: TranslationKey
}

export function DisabledTab({ Icon, labelKey, reasonKey }: Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
      <div className="relative mb-4">
        <Icon className="size-10 opacity-40" />
        <Lock className="absolute -bottom-1 -right-1 size-4 text-muted-foreground" />
      </div>
      <div className="text-base font-bold text-foreground mb-1">
        {t('tips.placeholder.comingIn', { label: t(labelKey) })}
      </div>
      <div className="text-sm max-w-[260px]">{t(reasonKey)}</div>
    </div>
  )
}
