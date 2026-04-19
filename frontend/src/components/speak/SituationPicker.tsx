import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { SITUATIONS } from '@/lib/constants'

interface SituationPickerProps {
  onSelect: (situationId: string) => void
}

export function SituationPicker({ onSelect }: SituationPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t('speak.selectSituation')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {SITUATIONS.map(s => (
          <Card
            key={s.id}
            className="cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
            onClick={() => onSelect(s.id)}
          >
            <CardHeader className="p-3">
              <CardTitle className="text-sm">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <span className="text-xs text-muted-foreground">{s.level}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
