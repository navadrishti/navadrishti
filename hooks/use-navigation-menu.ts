import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'

/** Open/closed state for a mobile menu that closes itself whenever the route changes. */
export function useNavigationMenu() {
  const pathname = usePathname()
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const setOpen = useCallback((open: boolean) => setOpenOnPath(open ? pathname : null), [pathname])
  return [openOnPath === pathname, setOpen] as const
}
