import { useCallback, useSyncExternalStore } from 'react'

/**
 * Current time rounded down to `intervalMs`, re-rendering once per interval.
 * Returns 0 during server render and hydration so markup stays deterministic.
 */
export function useNow(intervalMs = 60_000) {
  const subscribe = useCallback(
    (onTick: () => void) => {
      const timer = window.setInterval(onTick, intervalMs)
      return () => window.clearInterval(timer)
    },
    [intervalMs]
  )

  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0
  )
}
