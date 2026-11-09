"use client"

import { useIsClient } from "@/hooks/use-is-client"
import { isCompanyEmployeeUserClient } from "@/lib/access-control"
import { useAuth } from "@/lib/auth-context"
import { getDashboardLink, getHeaderNavItems } from "./header/nav-config"
import { DesktopSidebar } from "./header/desktop-sidebar"
import { MobileHeader } from "./header/mobile-header"
import { useProfileSearch } from "./header/use-profile-search"

export { AuthBackButton, AuthCardBackRow } from "./header/auth-back-button"

export function Header({ className = '' }: { className?: string } = {}) {
  const { user, loading, logout } = useAuth()
  const search = useProfileSearch()
  const mounted = useIsClient()
  const isEmployee = isCompanyEmployeeUserClient(user)

  const handleLogout = async () => {
    await logout()
  }

  const navLoading = !mounted || loading
  const navItems = getHeaderNavItems(user, mounted)
  const brandHref = isEmployee ? getDashboardLink(user) : '/'
  
  return (
    <>
      <DesktopSidebar
        className={className}
        navItems={navItems}
        navLoading={navLoading}
        search={search}
        user={user}
        onLogout={handleLogout}
        brandHref={brandHref}
        hideSearch={isEmployee}
        hideUtilityNav={isEmployee}
      />
      <MobileHeader
        navItems={navItems}
        navLoading={navLoading}
        search={search}
        user={user}
        onLogout={handleLogout}
        brandHref={brandHref}
        hideSearch={isEmployee}
        hideUtilityNav={isEmployee}
      />
    </>
  )
}
