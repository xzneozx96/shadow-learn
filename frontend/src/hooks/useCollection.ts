import type { HubResponse } from '@/types/collection'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

interface State {
  data: HubResponse | null
  loading: boolean
  error: Error | null
}

export function useCollection(): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/collection`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(`Server error: ${res.status}`)
        const data = (await res.json()) as HubResponse
        if (!cancelled)
          setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
