import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { PERSONAS } from '@/lib/speak/personas'

interface PersonaPickerProps {
  onSelect: (persona: { name: string, level: string }) => void
}

export function PersonaPicker({ onSelect }: PersonaPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('speak.selectPersona')}</h2>
      <div className="space-y-3">
        {PERSONAS.map(p => (
          <Card
            key={p.id}
            className="cursor-pointer hover:ring-2"
            onClick={() => onSelect({ name: p.name, level: p.level })}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <Badge variant="secondary">{p.level}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
