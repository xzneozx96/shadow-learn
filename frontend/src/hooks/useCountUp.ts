import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === 0) {
      setValue(0)
      return
    }
    let start: number | null = null
    let raf = 0
    const step = (ts: number) => {
      if (start === null)
        start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - (1 - p) ** 4
      setValue(Math.round(eased * target))
      if (p < 1)
        raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
