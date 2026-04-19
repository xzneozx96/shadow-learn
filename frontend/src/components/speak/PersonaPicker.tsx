import type { Persona } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { PERSONAS } from '@/lib/constants'

interface PersonaPickerProps {
  onSelect: (persona: Persona) => void
}

export function PersonaPicker({ onSelect }: PersonaPickerProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t('speak.selectPersona')}</h2>
      <div className="space-y-2">
        {PERSONAS.map(p => (
          <Card
            key={p.id}
            className="cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
            onClick={() => onSelect(p)}
          >
            <CardHeader className="p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{p.name}</CardTitle>
                <Badge variant="secondary" className="text-xs">{p.level}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xs text-muted-foreground">{p.tagline}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
