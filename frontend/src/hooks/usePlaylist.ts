import type { PlaylistDetail } from '@/types/collection'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

interface State {
  data: PlaylistDetail | null
  loading: boolean
  error: Error | null
}

export function usePlaylist(playlistId: string): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  // Reset to loading state when playlistId changes (setState-during-render)
  const [lastId, setLastId] = useState(playlistId)
  if (lastId !== playlistId) {
    setLastId(playlistId)
    setState({ data: null, loading: true, error: null })
  }

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/playlist/${encodeURIComponent(playlistId)}`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(`Server error: ${res.status}`)
        const data = (await res.json()) as PlaylistDetail
        if (!cancelled)
          setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err })
      })
    return () => { cancelled = true }
  }, [playlistId])

  return state
}
