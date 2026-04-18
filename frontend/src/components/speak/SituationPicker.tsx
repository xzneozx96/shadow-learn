import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { SITUATIONS } from '@/lib/speak/situations'

interface SituationPickerProps {
  onSelect: (situationId: string) => void
}

export function SituationPicker({ onSelect }: SituationPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('speak.selectSituation')}</h2>
      <div className="grid grid-cols-2 gap-4">
        {SITUATIONS.map(s => (
          <Card
            key={s.id}
            className="cursor-pointer hover:ring-2"
            onClick={() => onSelect(s.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">{s.level}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
