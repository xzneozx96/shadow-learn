import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'

interface Persona {
  id: string
  name: string
  description: string
  level: string
  icon: string
}

interface PersonaPickerProps {
  situationId: string
  onSelect: (persona: { name: string, level: string }) => void
}

export function PersonaPicker({ situationId, onSelect }: PersonaPickerProps) {
  const { t } = useI18n()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPersonas() {
      try {
        const res = await fetch(`${API_BASE}/api/speak/personas?situation_id=${situationId}`)
        if (!res.ok)
          throw new Error('Failed to fetch personas')
        const data = await res.json()
        setPersonas(data.personas ?? [])
      }
      catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      finally {
        setLoading(false)
      }
    }
    fetchPersonas()
  }, [situationId])

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  if (error) {
    return <div className="flex items-center justify-center py-12 text-destructive">{error}</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-muted-foreground">{t('speak.selectPersonaDesc')}</p>
      <div className="space-y-3">
        {personas.map(persona => (
          <button
            key={persona.id}
            onClick={() => onSelect({ name: persona.name, level: persona.level })}
            className="w-full text-left transition-transform hover:scale-[1.01]"
          >
            <Card className="cursor-pointer border-border hover:border-primary hover:bg-accent/50">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{persona.icon}</span>
                  <div>
                    <CardTitle className="text-base">{persona.name}</CardTitle>
                    <CardDescription className="line-clamp-1">{persona.description}</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="ml-2">{persona.level}</Badge>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
