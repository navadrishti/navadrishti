import { useCallback, useSyncExternalStore } from 'react'

/**
 * Current time rounded down to `intervalMs` at first client render.
 * Does not tick, so listing pages do not re-render on a timer.
 * Returns 0 during server render and hydration so markup stays deterministic.
 */
export function useNow(intervalMs = 60_000) {
  const subscribe = useCallback(() => () => {}, [])

  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0
  )
}
