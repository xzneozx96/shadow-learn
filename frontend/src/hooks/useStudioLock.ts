import { useEffect, useState } from 'react'

// Module-level mutex so different Studio tiles in the same UtilityPane
// instance all see the same "in-flight" signal without prop-drilling.
let _holderId: string | null = null
const _listeners = new Set<(holder: string | null) => void>()

function _setHolder(next: string | null) {
  _holderId = next
  _listeners.forEach(l => l(next))
}

export function useStudioLock(myId: string) {
  const [holder, setHolder] = useState<string | null>(_holderId)
  useEffect(() => {
    _listeners.add(setHolder)
    return () => { _listeners.delete(setHolder) }
  }, [])

  const acquire = () => {
    if (_holderId !== null && _holderId !== myId)
      return false
    _setHolder(myId)
    return true
  }
  const release = () => {
    if (_holderId === myId)
      _setHolder(null)
  }
  return {
    inFlightByOther: holder !== null && holder !== myId,
    inFlightByMe: holder === myId,
    acquire,
    release,
  }
}
