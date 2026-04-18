import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/I18nContext'
import { API_BASE } from '@/lib/config'

interface Situation {
  id: string
  name: string
  description: string
  icon: string
}

interface SituationPickerProps {
  onSelect: (situationId: string) => void
}

export function SituationPicker({ onSelect }: SituationPickerProps) {
  const { t } = useI18n()
  const [situations, setSituations] = useState<Situation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSituations() {
      try {
        const res = await fetch(`${API_BASE}/api/speak/situations`)
        if (!res.ok)
          throw new Error('Failed to fetch situations')
        const data = await res.json()
        setSituations(data.situations ?? [])
      }
      catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      finally {
        setLoading(false)
      }
    }
    fetchSituations()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  if (error) {
    return <div className="flex items-center justify-center py-12 text-destructive">{error}</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-muted-foreground">{t('speak.selectSituationDesc')}</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {situations.map(situation => (
          <button
            key={situation.id}
            onClick={() => onSelect(situation.id)}
            className="text-left transition-transform hover:scale-[1.02]"
          >
            <Card className="cursor-pointer border-border hover:border-primary hover:bg-accent/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{situation.icon}</span>
                  <CardTitle className="text-base">{situation.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-2">{situation.description}</CardDescription>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
