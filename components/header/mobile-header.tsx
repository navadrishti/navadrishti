"use client"

import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import type { User } from "@/lib/auth-context"
import type { LaunchHeaderNavItem } from "@/lib/access-control"
import { ProductBrand } from "@/components/product-brand"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import { NavbarSearchInput } from "./navbar-search-input"
import { PrimaryNavLinks, SidebarUtilityNav } from "./nav-links"
import { ProfileSearchResults } from "./profile-search-results"
import { SheetAccount } from "./sheet-account"
import type { ProfileSearch } from "./use-profile-search"

export function MobileHeader({
  navItems,
  navLoading,
  search,
  user,
  onLogout,
}: {
  navItems: LaunchHeaderNavItem[]
  navLoading: boolean
  search: ProfileSearch
  user: User | null
  onLogout: () => void
}) {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const { searchQuery, isSearching, handleSearchChange, clearSearch } = search

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nd-mobile-menu-state', { detail: { open: mobileSheetOpen } }))
  }, [mobileSheetOpen])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-platform-sidebar text-white md:hidden">
      <div className="flex h-16 items-center gap-4 px-4">
        {navLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-md bg-white/40" />
            <Skeleton className="h-5 w-20 rounded bg-white/40" />
          </div>
        ) : (
          <ProductBrand href="/" nameClassName="text-white" poweredClassName="text-white/75" />
        )}
        <div className="flex flex-1 items-center justify-end gap-2">
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
              >
                <Menu className="h-5 w-5 text-white" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="border-l border-platform-sidebar bg-platform-sidebar w-full p-0 [&>button]:hidden">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Access navigation links, search, and user account options
              </SheetDescription>

              <div className="flex flex-col h-full relative z-10">
                <div className="flex-shrink-0 border-b border-white/20 bg-platform-sidebar px-3 py-2">
                  <div className="flex items-center justify-between h-12">
                    <ProductBrand href="/" size="sm" nameClassName="text-white" poweredClassName="text-white/75" />

                    <SheetClose asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/10 h-8 w-8"
                      >
                        <X className="h-5 w-5" />
                        <span className="sr-only">Close menu</span>
                      </Button>
                    </SheetClose>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-platform-sidebar p-6">
                  <div className="mb-6">
                    <NavbarSearchInput
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onClear={clearSearch}
                    />
                  </div>

                  {(searchQuery.length >= 1 || isSearching) && (
                    <div className="mt-3 border-2 border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-white">
                        <ProfileSearchResults search={search} variant="sheet" />
                      </div>
                    </div>
                  )}
                  <PrimaryNavLinks
                    items={navItems}
                    isLoading={navLoading}
                    keyPrefix="mobile-nav"
                    className="grid gap-2 text-base font-medium mb-8"
                    skeletonClassName="h-10 w-full rounded-lg bg-white/40"
                    linkClassName="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors"
                  />

                  <SidebarUtilityNav
                    className="mb-8"
                    isLoading={navLoading}
                    buttonClassName="block w-full rounded-lg border border-white bg-transparent px-3 py-2.5 text-left text-base font-medium leading-snug text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-100"
                    linkClassName="flex items-center gap-3 px-3 py-2.5 text-base font-medium text-[#F5F7F8] hover:bg-white/5 hover:text-white rounded-lg transition-colors"
                  />

                  <SheetAccount user={user} isLoading={navLoading} onLogout={onLogout} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
