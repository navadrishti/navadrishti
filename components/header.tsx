"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { DesktopSidebar } from "./header/desktop-sidebar"
import { MobileHeader } from "./header/mobile-header"
import { getHeaderNavItems } from "./header/nav-config"
import { useProfileSearch } from "./header/use-profile-search"

export { AuthBackButton, AuthCardBackRow } from "./header/auth-back-button"

export function Header({ className = '' }: { className?: string } = {}) {
  const { user, loading, logout } = useAuth()
  const search = useProfileSearch()
  const [mounted, setMounted] = useState(false)

  // User-dependent content waits for mount to avoid a hydration mismatch.
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const navLoading = !mounted || loading
  const navItems = getHeaderNavItems(user, mounted)

  return (
    <>
      <DesktopSidebar
        className={className}
        navItems={navItems}
        navLoading={navLoading}
        search={search}
        user={user}
        onLogout={handleLogout}
      />
      <MobileHeader
        navItems={navItems}
        navLoading={navLoading}
        search={search}
        user={user}
        onLogout={handleLogout}
      />
    </>
  )
}
