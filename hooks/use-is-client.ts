import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** False during server render and hydration, true once the component runs in the browser. */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
