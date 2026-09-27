"use client"

import type { User } from "@/lib/auth-context"
import type { LaunchHeaderNavItem } from "@/lib/access-control"
import { ProductBrand } from "@/components/product-brand"
import { Skeleton } from "@/components/ui/skeleton"
import { NavbarSearchInput } from "./navbar-search-input"
import { PrimaryNavLinks, SidebarUtilityNav } from "./nav-links"
import { ProfileSearchResults } from "./profile-search-results"
import { SidebarAccount } from "./sidebar-account"
import type { ProfileSearch } from "./use-profile-search"

export function DesktopSidebar({
  className,
  navItems,
  navLoading,
  search,
  user,
  onLogout,
}: {
  className: string
  navItems: LaunchHeaderNavItem[]
  navLoading: boolean
  search: ProfileSearch
  user: User | null
  onLogout: () => void
}) {
  const { searchQuery, showResults, setShowResults, setShowAllResults, handleSearchChange, clearSearch } = search

  return (
    <aside
      className={`platform-sidebar bg-platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 text-white md:flex ${className}`}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/15 px-4 py-4">
          {navLoading ? (
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-md bg-white/40" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-20 rounded bg-white/40" />
                <Skeleton className="h-2.5 w-28 rounded bg-white/30" />
              </div>
            </div>
          ) : (
            <ProductBrand href="/" nameClassName="text-white" poweredClassName="text-white/75" />
          )}
        </div>
        <div className="relative shrink-0 px-3 pt-4">
          <div className="relative z-50">
            {navLoading ? (
              <Skeleton className="h-10 w-full rounded-lg bg-white/40" />
            ) : (
              <NavbarSearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                onClear={clearSearch}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    clearSearch()
                    e.currentTarget.blur()
                  }
                }}
                onFocus={() => {
                  setShowResults(true)
                }}
                onBlur={(e) => {
                  setTimeout(() => {
                    const relatedTarget = e.relatedTarget as HTMLElement
                    const isClickingDropdown = relatedTarget && (
                      relatedTarget.closest('[data-search-dropdown]') ||
                      relatedTarget.getAttribute('data-search-dropdown') !== null
                    )

                    if (!isClickingDropdown) {
                      if (!searchQuery.trim()) {
                        setShowResults(false)
                        setShowAllResults(false)
                      }
                    }
                  }, 150)
                }}
              />
            )}
          </div>

          {showResults && (
            <div
              className="absolute left-full top-0 z-50 ml-2"
              data-search-dropdown="true"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="w-80 p-0 border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden bg-white">
                <div className="bg-white">
                  <ProfileSearchResults search={search} variant="sidebar" />
                </div>
              </div>
            </div>
          )}
        </div>
        <PrimaryNavLinks
          items={navItems}
          isLoading={navLoading}
          keyPrefix="desktop-nav"
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4"
          skeletonClassName="h-9 w-full rounded-md bg-white/40"
          linkClassName="rounded-md px-3 py-2 text-sm font-medium text-[#F5F7F8] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
        />
        <SidebarUtilityNav
          className="shrink-0 border-t border-white/15 px-3 py-3"
          isLoading={navLoading}
          buttonClassName="block w-full rounded-md border border-white bg-transparent px-2.5 py-1.5 text-left text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-100"
          linkClassName="rounded-md px-3 py-2 text-sm font-medium text-[#B7C1C7] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
        />
        <SidebarAccount user={user} isLoading={navLoading} onLogout={onLogout} />
      </div>
    </aside>
  )
}
